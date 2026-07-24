const stylelintConfig = {
  extends: ["stylelint-config-standard-scss"],
  rules: {
    // Codebase convention is to keep the .scss extension on partial imports
    // (e.g. `@import '../../Variables.module.scss'`) -- the opposite of this
    // config's default. Match existing usage instead of the default.
    "scss/load-partial-extension": "always",
    // CSS Modules classes are accessed as JS properties (styles.emptyState),
    // so camelCase is the codebase-wide convention -- not kebab-case.
    "selector-class-pattern": null,
    // :global(...) is CSS Modules syntax for escaping into the global scope,
    // not a real CSS pseudo-class.
    "selector-pseudo-class-no-unknown": [true, { ignorePseudoClasses: ["global", "local"] }],
  },
};

export default stylelintConfig;
