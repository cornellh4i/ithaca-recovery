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
    // This app displays every date/time in fixed Eastern Time (Ithaca is a physical location --
    // meeting times shouldn't shift with the viewer's device timezone), enforced by the
    // DST-safe helpers in util/date/timeUtils.ts / util/date/timeFormat.tsx. These three
    // patterns all read/construct dates using the *runtime's local* timezone instead, which is
    // silently wrong for any viewer not on Eastern time -- ban them everywhere else so this
    // gets caught at lint time instead of by a viewer noticing the wrong day/time.
    // util/date/** is exempt: it's where these are the legitimate low-level primitives.
    // tests/** is exempt: covered instead by TZ=UTC-pinned jest runs and Playwright's own
    // timezoneId: "UTC" (see config/playwright.config.ts), and legitimately builds arbitrary
    // fixture dates. scripts/** is exempt: migrateMongoToPostgres.ts intentionally passes
    // Mongo Date values through as-is.
    files: ["**/*.{ts,tsx}"],
    ignores: ["util/date/**", "tests/**", "scripts/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(getDate|getDay|getMonth|getFullYear|getHours|getMinutes|getSeconds|getMilliseconds)$/]",
          message:
            "Local-timezone Date getters are banned outside util/date/** -- this app always displays fixed Eastern Time. Use the ET-safe helpers in util/date/timeUtils.ts (e.g. formatETDateString, getCurrentETMinutesSinceMidnight, getETDayOfMonth) instead.",
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(toLocaleDateString|toLocaleString|toLocaleTimeString)$/]",
          message:
            "Local-timezone Date formatting is banned outside util/date/** -- this app always displays fixed Eastern Time. Use the Intl.DateTimeFormat-based formatters in util/date/timeUtils.ts / util/date/timeFormat.tsx (all pinned timeZone: 'America/New_York') instead.",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length>1]",
          message:
            "new Date(year, month, day, ...) constructs in the runtime's local timezone. Build ET dates via util/date/timeUtils.ts (parseMMDDYYYY, convertETToUTC) instead.",
        },
      ],
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
