// Shared color helpers for rendering room-colored meeting cards.
//
// Room colors themselves never change between themes (they're meeting identity). What does
// change is what a wash mixes toward: white in light mode, the dark surface in dark mode --
// --wash-base in styles/theme.scss. Mixing in CSS (not here) is what lets the same inline
// style follow a theme switch without re-rendering.

/** Meeting-block background: the room color 30/70 toward the theme's wash base. */
export const roomWash = (color: string): string =>
  `color-mix(in srgb, ${color} 30%, var(--wash-base))`;

/**
 * Tag-pill background inside a room-colored card: the solid room color in light mode, a
 * stronger mix of the same pair in dark (--chip-strength), so light text still reads on it.
 */
export const roomChip = (color: string): string =>
  `color-mix(in srgb, ${color} var(--chip-strength), var(--wash-base))`;
