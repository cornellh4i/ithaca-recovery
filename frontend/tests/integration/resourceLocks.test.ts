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

  // Signaled the instant the first transaction actually holds the lock -- awaited below instead
  // of a fixed sleep, so starting the second transaction never races the first's own acquisition
  // regardless of how fast/slow the environment is (a fixed delay here previously made this test
  // flaky on a slower CI runner: the second transaction could start, and win, before the first
  // had actually acquired anything).
  let signalFirstAcquired: () => void = () => {};
  const firstAcquired = new Promise<void>((resolve) => {
    signalFirstAcquired = resolve;
  });

  let firstAcquiredAt: number | null = null;
  let secondAcquiredAt: number | null = null;

  // Holds its lock open until releaseFirst() is called below.
  const firstTx = prisma.$transaction(async (tx) => {
    await lockResourceClaims(tx, claims);
    firstAcquiredAt = Date.now();
    signalFirstAcquired();
    await firstMayFinish;
  });

  await firstAcquired;

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
  let signalFirstAcquired: () => void = () => {};
  const firstAcquired = new Promise<void>((resolve) => {
    signalFirstAcquired = resolve;
  });

  const firstTx = prisma.$transaction(async (tx) => {
    await lockResourceClaims(tx, [{ type: "room", value: "Independent Room A" }]);
    signalFirstAcquired();
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  await firstAcquired; // deterministic, not a fixed sleep -- see the comment in the test above

  const secondTx = prisma.$transaction(async (tx) => {
    await lockResourceClaims(tx, [{ type: "room", value: "Independent Room B" }]);
  }).then(() => {
    secondResolved = true;
    return "second";
  });

  // The first transaction deliberately stays open for 300ms. If the second one were blocked
  // on the first's (unrelated) lock, it could not win this race.
  const winner = await Promise.race([secondTx, firstTx.then(() => "first")]);
  expect(winner).toBe("second");
  expect(secondResolved).toBe(true);

  await firstTx;
});
