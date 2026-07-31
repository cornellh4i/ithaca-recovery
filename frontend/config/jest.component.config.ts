import type { Config } from "jest";

// React component tests (Testing Library + jsdom) — separate from jest.config.ts's
// pure-function/node-only unit suite so that suite's documented "no I/O, no DOM" contract
// stays true rather than silently expanding scope.
const config: Config = {
  displayName: "component",
  testEnvironment: "jsdom",
  rootDir: "..",
  testMatch: ["<rootDir>/tests/component/**/*.test.tsx"],
  transform: { "^.+\\.tsx?$": "@swc/jest" },
  moduleNameMapper: {
    "^server-only$": "<rootDir>/tests/mocks/server-only.js",
    "\\.module\\.scss$": "identity-obj-proxy",
  },
  setupFilesAfterEnv: ["<rootDir>/tests/component/setup.ts"],
};

export default config;
