import { useEffect, useState } from "react";

// Admin-only conflict-badge data for the Day/Week calendar (see app/api/admin/conflict-mids).
// The endpoint itself enforces admin-only via requireRole -- a public/non-admin viewer's fetch
// 401s and this just resolves to an empty set, no error surfaced, since a public viewer was
// never meant to see this in the first place. `enabled` (default true) lets a caller that
// already knows the viewer isn't signed in skip the fetch entirely rather than firing one that's
// certain to 401.
export function useConflictMids(refreshTrigger: number, enabled = true): Set<string> {
  const [mids, setMids] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) {
      setMids(new Set());
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/conflict-mids");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMids(new Set<string>(data.mids ?? []));
      } catch (err) {
        console.error("Error fetching conflict mids:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTrigger, enabled]);

  return mids;
}
