const stylelintConfig = {
  extends: ["stylelint-config-standard-scss"],
  rules: {
    "scss/load-partial-extension": "never",
    // CSS Modules classes are accessed as JS properties (styles.emptyState),
    // so camelCase is the codebase-wide convention -- not kebab-case.
    "selector-class-pattern": null,
    // :global(...) is CSS Modules syntax for escaping into the global scope,
    // not a real CSS pseudo-class.
    "selector-pseudo-class-no-unknown": [true, { ignorePseudoClasses: ["global", "local"] }],
  },
  overrides: [
    {
      // Component colors must come from the theme tokens (styles/theme.scss, aliased in
      // styles/Variables.module.scss) -- a raw hex here never changes with the theme, so it
      // ships as a light-mode patch in dark mode.
      files: ["../app/**/*.module.scss"],
      rules: {
        "color-no-hex": [
          true,
          { message: "Use a theme token from styles/Variables.module.scss instead of a raw hex color." },
        ],
        "color-named": [
          "never",
          { message: "Use a theme token from styles/Variables.module.scss instead of a named color." },
        ],
      },
    },
  ],
};

export default stylelintConfig;
