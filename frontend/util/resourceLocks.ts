import { Prisma } from "@prisma/client";
import { ResourceField } from "./resourceOverlap";

export type ResourceClaim = { type: ResourceField; value: string };

// Fixed per-type key instead of hashing `type` -- there are only 3 values, so a literal avoids
// any chance of a type/type or type/value hash collision; only same-type value collisions
// remain (hashtext(value) below), the minimum surface achievable with a 32-bit hash.
const TYPE_KEY: Record<ResourceField, number> = { room: 1, zoomRoom: 2, zoomHost: 3 };

// Closes the check-then-write race on room/zoomRoom/zoomHost conflicts (PR #303's accepted
// gap): two concurrent requests could both pass findResourceConflictRows before either wrote,
// and both succeed. A DB-level EXCLUDE constraint was considered and rejected -- it can't
// coexist with the "save anyway" override policy (see ithaca-recovery-arch-decisions.md's
// "[Designed 2026-08-06]" entry for the full reasoning). This closes it at the application
// layer instead: acquire a transaction-scoped advisory lock per requested resource before
// running the conflict check, so the check-then-write for a given resource is atomic relative
// to any other transaction racing for the same resource. Locks auto-release at commit/rollback
// -- no manual unlock needed. Must be called with the same `tx` used for the conflict check and
// the eventual write, so the lock and the queries run on the same DB session.
export async function lockResourceClaims(tx: Prisma.TransactionClient, claims: ResourceClaim[]): Promise<void> {
  const seen = new Set<string>();
  const unique = claims.filter((c) => {
    if (!c.value) return false; // nothing to protect -- the paired conflict check no-ops on this too
    const key = `${c.type}:${c.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sorted by the plain (type, value) string, not the resulting lock key -- any deterministic
  // order works, as long as every caller uses the same one. A single request can need up to 3
  // locks (room + zoomRoom + zoomHost); without a fixed order, two concurrent multi-resource
  // requests acquiring the same set of locks in different orders can deadlock (Postgres's
  // deadlock detector would abort one, which is safe but wastes a retry).
  unique.sort((a, b) => `${a.type}:${a.value}`.localeCompare(`${b.type}:${b.value}`));

  // Sequential, not Promise.all -- parallelizing would race the very ordering this exists to
  // enforce.
  for (const { type, value } of unique) {
    // Explicit ::int4 casts: Prisma sends a bare JS number as bigint, which doesn't match the
    // two-key pg_advisory_xact_lock(int4, int4) overload (only pg_advisory_xact_lock(bigint) or
    // the (int4, int4) pair are valid signatures -- a bigint/int4 mix matches neither).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${TYPE_KEY[type]}::int4, hashtext(${value}))`;
  }
}
