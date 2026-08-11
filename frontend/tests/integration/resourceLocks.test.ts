import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { seedMeeting } from "../factories/meeting";
import { lockResourceClaims } from "../../util/meetings/resourceLocks";
import { findFirstFreePoolHost } from "../../util/meetings/resourceOverlap";

afterAll(async () => {
  await disconnectTestPrismaClient();
});

// Large offset from "now", not a fixed calendar date -- avoids horizon/DST edge cases while
// staying well inside findFirstFreePoolHost's candidateHorizonRange window.
const testWindow = (offsetHours: number) => {
  const start = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { startDateTime: start, endDateTime: end, isRecurring: false as const };
};

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

describe("findFirstFreePoolHost", () => {
  it("skips an occupied host and returns the next free one in pool order", async () => {
    const prisma = getTestPrismaClient();
    const window = testWindow(200);
    const pool = ["pool-test-host-1@icr.test", "pool-test-host-2@icr.test"];
    await seedMeeting({ zoomHost: pool[0], modeType: "Remote", room: "", ...window });

    const host = await findFirstFreePoolHost(pool, window, prisma, { includeSuspended: true });
    expect(host).toBe(pool[1]);
  });

  it("returns null when every pool host conflicts", async () => {
    const prisma = getTestPrismaClient();
    const window = testWindow(210);
    const pool = ["pool-test-host-3@icr.test", "pool-test-host-4@icr.test"];
    await Promise.all(pool.map((zoomHost) => seedMeeting({ zoomHost, modeType: "Remote", room: "", ...window })));

    const host = await findFirstFreePoolHost(pool, window, prisma, { includeSuspended: true });
    expect(host).toBeNull();
  });
});

// The actual #360 regression test: proves pool-auto-assignment is now covered by the same
// lock-then-check mechanism as room/zoomRoom/manual-pick, using the same deterministic
// controlled-interleaving approach as the two tests above (see their shared comment for why a
// Promise.all two-POST-calls version isn't used here either).
test("auto-assignment locks the whole pool, so a second transaction sees the first's committed reservation instead of racing it", async () => {
  const prisma = getTestPrismaClient();
  const pool = ["pool-test-host-5@icr.test", "pool-test-host-6@icr.test"];
  const window = testWindow(220);

  let releaseFirst: () => void = () => {};
  const firstMayFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let signalFirstAcquired: () => void = () => {};
  const firstAcquired = new Promise<void>((resolve) => {
    signalFirstAcquired = resolve;
  });

  // Timestamps quantify the lock-wait cost this fix adds to a contended auto-assign request --
  // ithaca-recovery-zoom-host-pool-race-plan.md's performance-measurement item 2. secondAcquiredAt
  // must land at or after releasedAt (proves the second transaction was genuinely blocked, not
  // just slow to start), and the gap between them is the second request's actual added latency
  // under worst-case pool contention (every pool host held by one other in-flight request).
  let secondAcquiredAt: number | null = null;

  // Mirrors the reservation shape write/meeting, update/meeting, and update/meeting/sync all
  // now share: lock the whole pool, resolve on `tx`, persist the winning host before releasing.
  const firstTx = prisma.$transaction(async (tx) => {
    await lockResourceClaims(tx, pool.map((value) => ({ type: "zoomHost" as const, value })));
    const host = await findFirstFreePoolHost(pool, window, tx, { includeSuspended: true });
    if (host) await seedMeeting({ zoomHost: host, modeType: "Remote", room: "", ...window });
    signalFirstAcquired();
    await firstMayFinish;
    return host;
  });

  await firstAcquired;

  const secondTx = prisma.$transaction(async (tx) => {
    await lockResourceClaims(tx, pool.map((value) => ({ type: "zoomHost" as const, value })));
    secondAcquiredAt = Date.now();
    return findFirstFreePoolHost(pool, window, tx, { includeSuspended: true });
  });

  // The second transaction must still be blocked on the pool lock -- it cannot even start
  // resolving while the first (deliberately still open) holds every pool host locked.
  const raceResult = await Promise.race([
    secondTx.then(() => "second-resolved"),
    new Promise((resolve) => setTimeout(() => resolve("still-pending"), 200)),
  ]);
  expect(raceResult).toBe("still-pending");
  expect(secondAcquiredAt).toBeNull();

  const releasedAt = Date.now();
  releaseFirst();
  const firstHost = await firstTx;
  const secondHost = await secondTx;
  const unblockedLatencyMs = (secondAcquiredAt as unknown as number) - releasedAt;

  expect(secondAcquiredAt as unknown as number).toBeGreaterThanOrEqual(releasedAt);
  // Generous bound for a slower CI runner -- this is a correctness-of-blocking assertion (the
  // wait ends promptly once released, not that it hangs), not a strict perf budget.
  expect(unblockedLatencyMs).toBeLessThan(2000);

  // Without the fix, both transactions could independently resolve the pool before either
  // committed and both pick the same (last-free) host -- this is exactly what must not happen.
  expect(firstHost).not.toBeNull();
  expect(secondHost).not.toBeNull();
  expect(secondHost).not.toBe(firstHost);
});
