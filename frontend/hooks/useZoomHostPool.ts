import { useEffect, useState } from "react";
import { createCache } from "../util/simpleCache";

// Module-scope cache (see util/simpleCache.ts) -- the pool rarely changes within a session,
// and every meeting-form/ViewMeeting mount asking for it shouldn't each fire its own request.
const zoomHostsCache = createCache<string[]>();

async function fetchZoomHosts(): Promise<string[]> {
  const res = await fetch("/api/retrieve/zoom-hosts");
  if (!res.ok) return [];
  const data = await res.json();
  return data.hosts ?? [];
}

// hosts is the pool in ZOOM_HOSTS env-var order -- callers derive each host's friendly label
// from its index here via util/zoomHosts.ts's zoomHostLabel, rather than the server sending
// pre-labeled strings.
export function useZoomHostPool(): string[] {
  const [hosts, setHosts] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    zoomHostsCache.getOrFetch("zoom-hosts", fetchZoomHosts).then((result) => {
      if (!cancelled) setHosts(result);
    });
    return () => { cancelled = true; };
  }, []);

  return hosts;
}
