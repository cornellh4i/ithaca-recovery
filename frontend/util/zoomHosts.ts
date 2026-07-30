// Plain client-safe util (services/zoom.ts's zoomHostPool is "server-only") -- the friendly
// label is a pure function of a host's position in the ZOOM_HOSTS env var, recomputed fresh
// every time rather than stored anywhere. Deliberately NOT a stable per-email identity: if
// ZOOM_HOSTS is reordered, "Zoom Host 2" can point at a different email afterward -- acceptable
// since the email (not the label) is meant to be the unambiguous identifier.
export const zoomHostLabel = (email: string, index: number): string =>
  index === -1 ? email : `Zoom Host ${index + 1}`;
