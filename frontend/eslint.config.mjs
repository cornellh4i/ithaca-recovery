import nextConfig from "eslint-config-next";
import nextTypescriptConfig from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextConfig,
  ...nextTypescriptConfig,
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
];

export default eslintConfig;
