import type { Session } from "next-auth";

jest.mock("../../services/auth", () => ({
  requireRole: jest.fn(),
}));

jest.mock("../../services/syncOneMeeting", () => ({
  syncOneMeeting: jest.fn().mockResolvedValue({
    googleSyncStatus: "synced",
    googleSyncError: null,
    zoomSyncStatus: null,
    zoomSyncError: null,
  }),
}));

import { requireRole } from "../../services/auth";
import { syncOneMeeting } from "../../services/syncOneMeeting";
import { POST } from "../../app/api/update/meeting/sync/route";

const mockedRequireRole = jest.mocked(requireRole);
const mockedSync = jest.mocked(syncOneMeeting);

function sessionWith(googleAuthExpired: boolean): Session {
  return {
    user: { email: "admin@icr.test", role: "ADMIN" },
    accessToken: "stale-but-present-token",
    googleAuthExpired,
    expires: new Date(Date.now() + 60_000).toISOString(),
  } as unknown as Session;
}

const request = () =>
  new Request("http://localhost/api/update/meeting/sync", {
    method: "POST",
    body: JSON.stringify({ mid: "m-1" }),
  });

beforeEach(() => {
  mockedSync.mockClear();
});

test("a live grant retries the sync as usual", async () => {
  mockedRequireRole.mockResolvedValue(sessionWith(false));

  const response = await POST(request());

  expect(response.status).toBe(200);
  expect(mockedSync).toHaveBeenCalledWith("m-1", "stale-but-present-token");
});

// The access token is still present on the session, just dead -- without an explicit check the
// route spends a guaranteed 401 and rewrites googleSyncError with Google's credentials message,
// destroying whatever the meeting's real failure reason was.
test("an expired grant is refused before it can reach Google", async () => {
  mockedRequireRole.mockResolvedValue(sessionWith(true));

  const response = await POST(request());

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "GoogleAuthExpired" });
  expect(mockedSync).not.toHaveBeenCalled();
});
