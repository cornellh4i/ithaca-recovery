import type { Config } from "jest";

// Pure-function unit tests only — no DB, no I/O. See jest.integration.config.ts
// for route-handler tests that need mongodb-memory-server.
const config: Config = {
  displayName: "unit",
  testEnvironment: "node",
  rootDir: "..",
  testMatch: ["<rootDir>/test/unit/**/*.test.ts"],
  transform: { "^.+\\.tsx?$": "@swc/jest" },
  moduleNameMapper: { "^server-only$": "<rootDir>/test/mocks/server-only.js" },
};

export default config;
