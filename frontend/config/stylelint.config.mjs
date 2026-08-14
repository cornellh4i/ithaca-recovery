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
};

export default stylelintConfig;
