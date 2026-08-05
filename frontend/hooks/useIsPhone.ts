import { useViewport } from "./useViewport";

// Thin wrapper over useViewport(), kept for call sites that only ever branched on phone vs.
// not-phone (AppNavbar, MobileAppNavbar, page.tsx) -- device is now decided by the *smaller*
// viewport dimension rather than width alone (see useViewport.ts), so a phone in landscape
// still reports true here instead of falling through to the desktop branch.
//
// null means "not yet known" (no window on the server, and the client hasn't measured yet),
// same three-state convention as isAdmin: boolean | null elsewhere in this app -- callers
// should render nothing (not silently fall through to the desktop branch) while it's null, or
// a real phone would flash the desktop layout for the brief window before this resolves.
export function useIsPhone(): boolean | null {
  const viewport = useViewport();
  return viewport ? viewport.device === "phone" : null;
}
