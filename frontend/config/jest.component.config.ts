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
    "^.+\\.tsx?$": [
      "@swc/jest",
      { jsc: { transform: { react: { runtime: "automatic" } } } },
    ],
  },
  moduleNameMapper: {
    "^server-only$": "<rootDir>/tests/mocks/server-only.js",
    "\\.module\\.scss$": "identity-obj-proxy",
    "\\.css$": "identity-obj-proxy",
    "\\.(png|jpe?g|gif|svg)$": "<rootDir>/tests/mocks/fileMock.js",
  },
  setupFilesAfterEnv: ["<rootDir>/tests/component/setup.ts"],
};

export default config;
