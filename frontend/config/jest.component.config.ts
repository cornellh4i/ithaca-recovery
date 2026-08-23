import type { Config } from "jest";

// React component tests (Testing Library + jsdom) — separate from jest.config.ts's
// pure-function/node-only unit suite so that suite's documented "no I/O, no DOM" contract
// stays true rather than silently expanding scope.
const config: Config = {
  displayName: "component",
  testEnvironment: "jsdom",
  rootDir: "..",
  testMatch: ["<rootDir>/tests/component/**/*.test.tsx"],
  // Explicit automatic JSX runtime -- matches Next's own SWC build config, and this
  // codebase (React 19) has components that rely on the automatic runtime and don't import
  // React themselves (@swc/jest's own default is the classic runtime, which would break them).
  transform: {
    // .jsx? too, for the ESM-only node_modules carved out of transformIgnorePatterns below.
    "^.+\\.(t|j)sx?$": [
      "@swc/jest",
      { jsc: { transform: { react: { runtime: "automatic" } } } },
    ],
  },
  // uuid ships ESM-only (no CJS build as of v14) and jest doesn't transform node_modules, so
  // importing it under jsdom hits a raw `export` token -- hooks/useMeetingForm.ts reaches it
  // from every form test. Carved out by name rather than transforming node_modules wholesale.
  transformIgnorePatterns: ["/node_modules/(?!uuid/)", "\\.pnp\\.[^\\\\]+$"],
  moduleNameMapper: {
    "^server-only$": "<rootDir>/tests/mocks/server-only.js",
    // marked ships ESM-first (its exports map has no CJS entry) and jest doesn't transform
    // node_modules, so importing it under jsdom hits a raw `export` token. The UMD build is
    // the same code in require-able form — scoped mapping rather than a global
    // transformIgnorePatterns carve-out.
    "^marked$": "<rootDir>/node_modules/marked/lib/marked.umd.js",
    "\\.module\\.scss$": "identity-obj-proxy",
    "\\.css$": "identity-obj-proxy",
    "\\.(png|jpe?g|gif|svg)$": "<rootDir>/tests/mocks/fileMock.js",
  },
  setupFilesAfterEnv: ["<rootDir>/tests/component/setup.ts"],
};

export default config;
