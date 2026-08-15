import { NextRequest } from "next/server";
import { seedMeeting } from "../factories/meeting";
import { disconnectTestPrismaClient } from "../factories/db";

jest.mock("../../services/auth", () => ({
  getAuth: jest.fn(),
}));

import { getAuth } from "../../services/auth";
import { GET } from "../../app/api/retrieve/meeting/[id]/route";

const mockedGetAuth = getAuth as jest.Mock;

afterAll(async () => {
  await disconnectTestPrismaClient();
});

const ADMIN_ONLY_FIELDS = ["creator", "email", "googleSyncStatus", "zoomSyncError", "zoomPasscode", "zoomInvitation"];

async function getMeetingDetail(mid: string) {
  const request = new NextRequest(`http://localhost/api/retrieve/meeting/${mid}`);
  const response = await GET(request);
  return response.json();
}

test("an unauthenticated caller only gets the public-safe meeting fields", async () => {
  mockedGetAuth.mockResolvedValue(null);
  const meeting = await seedMeeting({ creator: "Someone Private", email: "private@test.icr" });

  const body = await getMeetingDetail(meeting.mid);
  expect(body.mid).toBe(meeting.mid);
  ADMIN_ONLY_FIELDS.forEach((field) => expect(body).not.toHaveProperty(field));
});

test("a USER-role session gets the same public-safe subset as an unauthenticated caller, not the full record", async () => {
  mockedGetAuth.mockResolvedValue({ user: { role: "USER" } });
  const meeting = await seedMeeting({ creator: "Someone Private", email: "private@test.icr" });

  const body = await getMeetingDetail(meeting.mid);
  expect(body.mid).toBe(meeting.mid);
  ADMIN_ONLY_FIELDS.forEach((field) => expect(body).not.toHaveProperty(field));
});

test("an ADMIN-role session gets the full record", async () => {
  mockedGetAuth.mockResolvedValue({ user: { role: "ADMIN" } });
  const meeting = await seedMeeting({ creator: "Someone Private", email: "private@test.icr" });

  const body = await getMeetingDetail(meeting.mid);
  expect(body.creator).toBe("Someone Private");
  expect(body.email).toBe("private@test.icr");
});

test("a SUPER_ADMIN-role session gets the full record", async () => {
  mockedGetAuth.mockResolvedValue({ user: { role: "SUPER_ADMIN" } });
  const meeting = await seedMeeting({ creator: "Someone Private", email: "private@test.icr" });

  const body = await getMeetingDetail(meeting.mid);
  expect(body.creator).toBe("Someone Private");
  expect(body.email).toBe("private@test.icr");
});
