import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { lockResourceClaims } from "../../util/resourceLocks";

afterAll(async () => {
  await disconnectTestPrismaClient();
});

// This is the actual mechanism write/meeting and update/meeting's transaction-guarded conflict
// checks depend on -- proven directly here (deterministic, controlled interleaving) rather than
// via two real POST()/PUT() calls racing under Promise.all. A route-level version of this test
// was tried first and rejected: against this app's fast local embedded-Postgres instance, two
// "concurrent" JS promises don't reliably interleave their DB round-trips in the specific window
// that would expose an unlocked race, so that test passed identically whether the lock call was
// present or commented out -- a green check that proved nothing. Directly controlling when each
// transaction acquires its lock and when the first one is allowed to finish removes that timing
// non-determinism entirely.
test("lockResourceClaims blocks a second transaction on the same resource until the first one ends", async () => {
  const prisma = getTestPrismaClient();
  const claims = [{ type: "room" as const, value: "Lock Blocking Test Room" }];

  let releaseFirst: () => void = () => {};
  const firstMayFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  let firstAcquiredAt: number | null = null;
  let secondAcquiredAt: number | null = null;

  // Holds its lock open until releaseFirst() is called below.
  const firstTx = prisma.$transaction(async (tx) => {
    await lockResourceClaims(tx, claims);
    firstAcquiredAt = Date.now();
    await firstMayFinish;
  });

  // Give the first transaction a moment to actually acquire the lock before starting the second
  // -- otherwise they could race to acquire it in either order, which isn't what this test is
  // checking (it's checking that whichever gets there first blocks the other, not lock fairness).
  await new Promise((resolve) => setTimeout(resolve, 50));

  const secondTx = prisma.$transaction(async (tx) => {
    await lockResourceClaims(tx, claims);
    secondAcquiredAt = Date.now();
  });

  // The second transaction must still be pending -- it cannot acquire the same lock while the
  // first transaction (which is deliberately still open) holds it.
  const raceResult = await Promise.race([
    secondTx.then(() => "second-resolved"),
    new Promise((resolve) => setTimeout(() => resolve("still-pending"), 200)),
  ]);
  expect(raceResult).toBe("still-pending");
  expect(secondAcquiredAt).toBeNull();

  releaseFirst();
  await firstTx;
  await secondTx;

  expect(firstAcquiredAt).not.toBeNull();
  expect(secondAcquiredAt).not.toBeNull();
  expect(secondAcquiredAt as unknown as number).toBeGreaterThanOrEqual(firstAcquiredAt as unknown as number);
});

test("lockResourceClaims does not block two transactions locking different resources", async () => {
  const prisma = getTestPrismaClient();
  let secondResolved = false;

  // Held open for well longer than the race window below -- if the second transaction wrongly
  // waited on this one's (unrelated) lock, it could not possibly resolve before the timeout.
  const firstTx = prisma.$transaction(async (tx) => {
    await lockResourceClaims(tx, [{ type: "room", value: "Independent Room A" }]);
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  await new Promise((resolve) => setTimeout(resolve, 50)); // let firstTx acquire its lock first

  const secondTx = prisma.$transaction(async (tx) => {
    await lockResourceClaims(tx, [{ type: "room", value: "Independent Room B" }]);
  }).then(() => {
    secondResolved = true;
  });

  const raceResult = await Promise.race([
    secondTx.then(() => "second-resolved"),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 150)),
  ]);
  expect(raceResult).toBe("second-resolved");
  expect(secondResolved).toBe(true);

  await firstTx;
});
