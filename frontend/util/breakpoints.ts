// JS-side source of truth for responsive breakpoints, mirroring the Sass tokens in
// Variables.module.scss ($breakpoint-phone / $breakpoint-tablet). Sass vars aren't importable
// into TS, so these are kept in sync manually — edit both together.
export const PHONE_BREAKPOINT = 480;
export const TABLET_BREAKPOINT = 768;
