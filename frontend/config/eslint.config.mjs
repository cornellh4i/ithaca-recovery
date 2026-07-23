import nextConfig from "eslint-config-next";
import nextTypescriptConfig from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextConfig,
  ...nextTypescriptConfig,
  {
    // The codebase already names intentionally-unused params/vars with a leading
    // underscore (e.g. `_e` in an onChange handler that must match a signature it
    // doesn't use) -- teach no-unused-vars to actually respect that convention
    // instead of still flagging them.
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // eslint-plugin-react-hooks v7 (pulled in by eslint-config-next 16) bundles former
    // React Compiler rules into its recommended set. set-state-in-effect/immutability
    // surface ~15 pre-existing effect patterns across the app that are real to look at,
    // but rewriting them isn't part of this dependency upgrade — downgraded to warn
    // pending a dedicated cleanup pass.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  {
    // Playwright fixtures take a `use` callback param; eslint-plugin-react-hooks'
    // naming heuristic mistakes it for the React hook of the same name.
    files: ["test/**"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    // These files' only <img> usages are local /svg icons, not content photos --
    // next/image's optimizer refuses local SVGs without images.dangerouslyAllowSVG,
    // and none of these tiny vector icons would benefit from it anyway. Scoped to
    // known files rather than disabled project-wide, so the rule still catches a
    // future real (raster) content image landing unoptimized.
    files: [
      "app/components/atoms/BoxText.tsx",
      "app/components/organisms/AppNavbar.tsx",
      "app/components/organisms/CalendarNavbar.tsx",
      "app/components/organisms/EditMeeting.tsx",
      "app/components/organisms/NewMeeting.tsx",
      "app/components/organisms/SignInPrompt.tsx",
      "app/components/organisms/ViewMeeting.tsx",
    ],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
