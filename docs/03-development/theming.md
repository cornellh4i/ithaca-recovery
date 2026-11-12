# Theming and Dark Mode

The app ships a light and a dark theme, plus a **System** setting that follows the viewer's OS.
Every color in a component comes from a theme token, and a stylelint rule keeps it that way.

## How it fits together

```
styles/theme.scss            ← the ONLY place colors are defined (both palettes)
  :root { --text: #1E1E1E; ... }                     light values (always present)
  :root[data-theme="dark"] { ... }                   explicit Dark choice
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { ... }          System choice on a dark OS
  }

styles/Variables.module.scss ← Sass aliases: $black-color: var(--text); ...
app/**/*.module.scss         ← use the $aliases; raw hex/named colors fail stylelint
```

- **Sass variables can't switch at runtime.** They compile away at build time, so each color
  alias resolves to a CSS custom property, and only the custom property's value changes per
  theme. The ~700 `$…-color` references across the component modules compile unchanged.
- **Every token needs a bare `:root` value.** A token defined only under `[data-theme]` never
  applies to a System-mode viewer.
- **The dark palette applies to screen media only**, so printing always uses light colors.
- **`color-scheme`** is set alongside the tokens, so native scrollbars and form controls
  follow the theme.

Breakpoints, radii, and z-index stay plain Sass; they never change with the theme.

## Choosing a token

| You're coloring… | Use | Why |
|---|---|---|
| The page itself | `$bg-color` | The darkest ground in dark mode |
| A card, panel, the calendar grid | `$surface-color` | One step above the ground |
| A popover, menu, modal, flyout, sheet | `$surface-overlay-color` | In dark mode, elevation comes from a lighter surface, not a bigger shadow |
| Hover/raised fill | `$grey-lightest-color` | |
| Text | `$black-color` → `$text-secondary-color` → `$medium-grey-color` | Primary → secondary → muted |
| Lines | `$grey-border-color`, `$light-grey-color` (stronger), `$border-divider-color` (hairline) | |
| Pink **fill** under white text | `$brand-pink-color` | `#CC3366` in both themes |
| Pink you **read** on the ground: text, outline, focus ring | `$brand-text-color` | Lightens to `#E05C8A` in dark; `#CC3366` is only 3.4:1 there |
| Danger/warning/success/link/info **fill** under white text | `$danger-fill-color` etc. | Fixed in both themes |
| Danger/warning/success/link/info **text or outline** | `$danger-color`, `$warning-text-color`, … | Lightens in dark |
| White text on a colored fill | `$white-color` | Stays white in both themes |
| Text on a dark neutral fill (tooltip, navy chip) | `$bg-color` | Inverts along with the fill |

The same fill-vs-text split applies to pink and to every semantic color. A token named for text
(`$danger-color`) lightens in dark, so using it as a button background under white text drops
contrast below 3:1. Use the `-fill-` variant there.

### Room colors

Room colors (`util/filterColors.ts` / `$room-*-color`) identify the meeting and are **identical in
both themes**: stripes, dots, filter checkboxes, and the Day-view room-label column (whose
text uses `$on-room-color`, dark in both themes).

Meeting-block **backgrounds** are washes, built in `util/common/color.ts`:

- `roomWash(color)`: `color-mix(in srgb, <room> 30%, var(--wash-base))`. The base is white in
  light and the dark surface in dark.
- `roomChip(color)`: tag pills inside a card, using `var(--chip-strength)`. That's the solid room
  color in light and a stronger mix in dark, so light text reads on it.

The mixing happens in CSS rather than JavaScript, so an inline style follows a theme switch
without re-rendering.

## The toggle and persistence

`util/common/theme.ts` holds the shared logic. The UI lives in `app/components/theme/`.

- **Light / Dark** set `data-theme` on `<html>` and save to `localStorage` (`icr-theme`).
  **System** removes both, and the media query decides.
- **No flash on load.** `ThemeScript` is an inline `<head>` script, rendered in the main and
  `/login` root layouts. It stamps `data-theme` during HTML parsing, before first paint.
  Applying the theme after hydration would be too late.
- **`useThemePreference`** (in `hooks/`) is the React side. It's a `useSyncExternalStore` over
  `localStorage`, so it hydrates cleanly and follows changes made in other tabs. It also
  re-applies the stamp, because React's dev-only Strict Mode remount resets `<html>`'s
  attributes.
- **Controls:**
  - `ThemeToggle`: desktop navbar icon button, cycling Light → Dark → System.
  - `ThemeOptions`: the mobile sidebar's three-option row.
  - `ThemeSync`: no UI; keeps the stamp applied where neither control is mounted.
- **`/signage`** is pinned `data-theme="light"`. Whether wall displays should default to dark is
  ICR's call.

## Guardrails

- **stylelint**: `color-no-hex` and `color-named: never` on `app/**/*.module.scss`
  (`config/stylelint.config.mjs`). A raw `#FFF` or `white` in a component fails `yarn lint:css`.
  `styles/theme.scss` is the place to add a color.
- **Third-party CSS**: Pagefind's docs search UI is themed by mapping its `--pf-*` variables in
  the dark palette (bottom of `theme.scss`). Do the same for any future library that exposes
  CSS variables.
- **Tests**:
  - `tests/unit/theme.test.ts`: preference logic and the inline script.
  - `tests/component/ThemeToggle.test.tsx`: both controls.
  - `tests/e2e/21-dark-mode.spec.ts`: cycling and persistence, no flash, System following the
    OS, the mobile row, and a dark smoke pass.

## Adding a color

1. Is there already a token for what it *means*? Use it. Most new UI needs nothing new.
2. If not, add it to `styles/theme.scss` with a bare `:root` light value, and add a dark value
   inside `dark-palette` unless it's identical in both themes. Then add a `$…-color` alias in
   `styles/Variables.module.scss`.
3. Check it in both themes. The navbar toggle switches instantly.
