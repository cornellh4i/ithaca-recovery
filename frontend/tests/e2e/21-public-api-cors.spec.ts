import { test, expect } from "./support/fixtures";

test("public meeting reads allow cross-origin requests from ICR's website", async ({ request }) => {
  const response = await request.get("/api/retrieve/meeting/day");
  expect(response.ok()).toBe(true);
  expect(response.headers()["access-control-allow-origin"]).toBe("*");
});

test("other API routes stay same-origin only", async ({ request }) => {
  const response = await request.get("/api/auth/status");
  expect(response.headers()["access-control-allow-origin"]).toBeUndefined();
});
