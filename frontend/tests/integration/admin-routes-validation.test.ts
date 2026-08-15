import { seedAdmin } from "../factories/admin";
import { disconnectTestPrismaClient } from "../factories/db";

jest.mock("../../services/auth", () => ({
  requireRole: jest.fn().mockResolvedValue({
    user: { role: "SUPER_ADMIN" },
  }),
}));

import { POST } from "../../app/api/write/admin/route";
import { PUT } from "../../app/api/update/admin/route";

afterAll(async () => {
  await disconnectTestPrismaClient();
});

test("inviting an admin with a malformed email returns 400", async () => {
  const request = new Request("http://localhost/api/write/admin", {
    method: "POST",
    body: JSON.stringify({ email: "not-an-email" }),
  });
  const response = await POST(request);
  expect(response.status).toBe(400);
});

test("inviting an admin with an already-registered email returns 409, not 500", async () => {
  const existing = await seedAdmin();
  const request = new Request("http://localhost/api/write/admin", {
    method: "POST",
    body: JSON.stringify({ email: existing.email }),
  });
  const response = await POST(request);
  expect(response.status).toBe(409);
});

test("updating an admin's role with an invalid role string returns 400", async () => {
  // Zod validation runs before any DB lookup, so this 400s without needing a seeded admin.
  const request = new Request("http://localhost/api/update/admin", {
    method: "PUT",
    body: JSON.stringify({ email: "someone@test.icr", role: "NOT_A_ROLE" }),
  });
  const response = await PUT(request);
  expect(response.status).toBe(400);
});

test("inviting an admin with a malformed JSON body returns 400, not 500", async () => {
  const request = new Request("http://localhost/api/write/admin", {
    method: "POST",
    body: "{not valid json",
  });
  const response = await POST(request);
  expect(response.status).toBe(400);
});

test("updating an admin's role with a malformed JSON body returns 400, not 500", async () => {
  const request = new Request("http://localhost/api/update/admin", {
    method: "PUT",
    body: "{not valid json",
  });
  const response = await PUT(request);
  expect(response.status).toBe(400);
});
