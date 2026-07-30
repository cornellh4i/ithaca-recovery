import type { Config } from "jest";

// Pure-function unit tests only — no DB, no I/O. See jest.integration.config.ts
// for route-handler tests that need mongodb-memory-server.
const config: Config = {
  displayName: "unit",
  testEnvironment: "node",
  rootDir: "..",
  testMatch: ["<rootDir>/tests/unit/**/*.test.ts"],
  transform: { "^.+\\.tsx?$": "@swc/jest" },
  moduleNameMapper: { "^server-only$": "<rootDir>/tests/mocks/server-only.js" },
};

export default config;
