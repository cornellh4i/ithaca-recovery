import type { Config } from "jest";

// Route-handler integration tests — real (in-memory) Mongo via Prisma, with
// services/googleCalendar.ts and services/zoom.ts mocked per-test via
// jest.mock() where precise call-timing/shape control is needed.
const config: Config = {
  displayName: "integration",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/test/integration/**/*.test.ts"],
  transform: { "^.+\\.tsx?$": "@swc/jest" },
  moduleNameMapper: { "^server-only$": "<rootDir>/test/mocks/server-only.js" },
  globalSetup: "<rootDir>/test/integration/globalSetup.ts",
  globalTeardown: "<rootDir>/test/integration/globalTeardown.ts",
  testTimeout: 30_000,
};

export default config;
