import { useEffect, useState } from "react";

// Admin-only sync-error-badge data for the Day/Week calendar (see app/api/admin/sync-error-mids).
// Mirrors useConflictMids.ts exactly -- the endpoint enforces admin-only via requireRole, so a
// public/non-admin viewer's fetch 401s and this just resolves to an empty set, no error
// surfaced. `enabled` (default true) lets a caller that already knows the viewer isn't an admin
// skip the fetch entirely; also accepts null (the caller's own admin check hasn't resolved yet)
// and treats it the same as false.
export function useSyncErrorMids(refreshTrigger: number, enabled: boolean | null = true): Set<string> {
  const [mids, setMids] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) {
      setMids(new Set());
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/sync-error-mids");
        if (!res.ok) {
          // A mid-session role change or expired session (401/403) after a prior successful
          // fetch shouldn't leave stale admin-only sync-error mids rendered.
          if (!cancelled) setMids(new Set());
          return;
        }
        const data = await res.json();
        if (!cancelled) setMids(new Set<string>(data.mids ?? []));
      } catch (err) {
        if (!cancelled) setMids(new Set());
        console.error("Error fetching sync-error mids:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTrigger, enabled]);

  return mids;
}
