import nextConfig from "eslint-config-next";
import nextTypescriptConfig from "eslint-config-next/typescript";

const eslintConfig = [
  {
    // Vendored/minified output from build-scripts/generate-pagefind-index.mjs, not source we
    // own -- same "generated, don't lint" treatment util/docs/docsContent.generated.ts gets
    // implicitly by having no lint-worthy content of its own.
    ignores: ["public/pagefind/**"],
  },
  ...nextConfig,
  ...nextTypescriptConfig,
  {
    // Respect the codebase's existing "_"-prefix = intentionally unused convention.
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // New React-Compiler-derived rules in eslint-plugin-react-hooks v7; real findings,
    // but a rewrite is out of scope here. Downgraded pending a dedicated pass.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  {
    // False positive: Playwright's `use` fixture param, not the React hook.
    files: ["tests/**"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    // Local SVG icons only, not content photos -- next/image needs
    // dangerouslyAllowSVG for these and gains nothing doing so.
    files: [
      "app/components/ui/displays/BoxText.tsx",
      "app/components/navigation/AppNavigation.tsx",
      "app/components/calendar/CalendarNavbar.tsx",
      "app/components/meeting-form/EditMeeting.tsx",
      "app/components/meeting-form/NewMeeting.tsx",
      "app/components/calendar/SignInPrompt.tsx",
      "app/components/meeting-form/ViewMeeting.tsx",
    ],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
