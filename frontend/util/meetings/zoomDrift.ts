/**
 * Whether Zoom's live credentials differ from the stored copy. The join URL's host is ignored:
 * Zoom serves the same meeting from any *.zoom.us domain, so an account-level switch (e.g. to a
 * vanity subdomain) changes every join_url without changing what attendees can join with.
 */
export function hasZoomCredentialDrift(
  live: { joinUrl: string; passcode: string | null },
  stored: { zoomLink: string | null; zoomPasscode: string | null },
): boolean {
  return (
    joinTarget(live.joinUrl) !== joinTarget(stored.zoomLink) ||
    live.passcode !== (stored.zoomPasscode || null)
  );
}

// Stored links on adopted meetings are admin-typed free text, so an unparseable one compares
// verbatim.
function joinTarget(link: string | null): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    return url.pathname + url.search;
  } catch {
    return link;
  }
}
