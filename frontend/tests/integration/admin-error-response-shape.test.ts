// Unlike the other integration tests, this mocks lib/prisma entirely (no real DB) --
// the only way to force the 500 branch on demand and confirm it never echoes the raw
// Prisma error into the response body (the bug this file guards against).
jest.mock("../../services/auth", () => ({
  requireRole: jest.fn().mockResolvedValue({
    user: { role: "SUPER_ADMIN" },
  }),
}));

jest.mock("../../lib/prisma", () => ({
  prisma: {
    admin: {
      findUnique: jest.fn().mockRejectedValue(new Error("connection to server at db.internal.example, port 5432 failed")),
      findMany: jest.fn().mockRejectedValue(new Error("connection to server at db.internal.example, port 5432 failed")),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as getAdmin } from "../../app/api/retrieve/admin/route";
import { GET as getAdmins } from "../../app/api/retrieve/admins/route";

test("GET /api/retrieve/admin never echoes the raw DB error into the response body", async () => {
  const request = new NextRequest("http://localhost/api/retrieve/admin?email=someone@test.icr");
  const response = await getAdmin(request);
  const body = await response.json();
  expect(response.status).toBe(500);
  expect(body).toEqual({ error: "Internal Server Error" });
});

test("GET /api/retrieve/admins never echoes the raw DB error into the response body", async () => {
  const response = await getAdmins();
  const body = await response.json();
  expect(response.status).toBe(500);
  expect(body).toEqual({ error: "Internal Server Error" });
});
