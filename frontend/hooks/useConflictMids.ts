import { useEffect, useState } from "react";

export type ConflictMids = {
  mids: Set<string>;
  // How many *other* meetings each conflicting mid overlaps with -- backs ViewMeeting's
  // conflict warning message. Absent from the Set-only shape since BoxText's badge only ever
  // needed membership, not a count.
  counts: Map<string, number>;
};

// Admin-only conflict-badge data for the Day/Week calendar (see app/api/admin/conflict-mids).
// The endpoint itself enforces admin-only via requireRole -- a public/non-admin viewer's fetch
// 401s and this just resolves to an empty set, no error surfaced, since a public viewer was
// never meant to see this in the first place. `enabled` (default true) lets a caller that
// already knows the viewer isn't signed in skip the fetch entirely rather than firing one that's
// certain to 401.
export function useConflictMids(refreshTrigger: number, enabled = true): ConflictMids {
  const [mids, setMids] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!enabled) {
      setMids(new Set());
      setCounts(new Map());
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/conflict-mids");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setMids(new Set<string>(data.mids ?? []));
          setCounts(new Map<string, number>(Object.entries(data.counts ?? {})));
        }
      } catch (err) {
        console.error("Error fetching conflict mids:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTrigger, enabled]);

  return { mids, counts };
}
