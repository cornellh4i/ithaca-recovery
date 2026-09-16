import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Session } from "next-auth";
import { signIn, useSession } from "next-auth/react";
import GoogleReconnectBanner from "../../app/components/auth/GoogleReconnectBanner";

jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
  useSession: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(() => "/admin/diagnostics"),
}));

const mockedUseSession = useSession as unknown as jest.Mock;

const buildSession = (overrides: Partial<Session> = {}): Session => ({
  user: { name: "Jamie Rivera", email: "jamie@example.com", role: "ADMIN" },
  expires: "2099-01-01T00:00:00.000Z",
  ...overrides,
});

const TITLE = "Google Calendar isn't accepting changes from this account.";

describe("GoogleReconnectBanner", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing when there is no session", () => {
    mockedUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    const { container } = render(<GoogleReconnectBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a session whose Google authorization is healthy", () => {
    mockedUseSession.mockReturnValue({ data: buildSession(), status: "authenticated" });
    render(<GoogleReconnectBanner />);
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it("explains the condition and offers a reconnect when the authorization is expired", () => {
    mockedUseSession.mockReturnValue({
      data: buildSession({ googleAuthExpired: true }),
      status: "authenticated",
    });
    render(<GoogleReconnectBanner />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(screen.getByText(/meetings still save, but they stop publishing/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect Google" })).toBeInTheDocument();
  });

  // A third signIn() argument replaces authConfig's own prompt: "consent" rather than merging
  // with it, and without consent Google withholds the refresh token this banner exists to restore.
  it("signs in with no third argument, returning to the current page", () => {
    mockedUseSession.mockReturnValue({
      data: buildSession({ googleAuthExpired: true }),
      status: "authenticated",
    });
    render(<GoogleReconnectBanner />);

    fireEvent.click(screen.getByRole("button", { name: "Reconnect Google" }));

    expect(signIn).toHaveBeenCalledWith("google", { callbackUrl: "/admin/diagnostics" });
    expect((signIn as jest.Mock).mock.calls[0]).toHaveLength(2);
  });

  // usePathname() drops the query string, and the calendar addresses an open meeting entirely
  // through ?mid= -- returning to the bare path would strand the admin back at the grid.
  it("keeps the query string so a deep-linked meeting survives the round trip", () => {
    window.history.replaceState({}, "", "/admin/diagnostics?mid=m-1&edit=1");
    mockedUseSession.mockReturnValue({
      data: buildSession({ googleAuthExpired: true }),
      status: "authenticated",
    });
    render(<GoogleReconnectBanner />);

    fireEvent.click(screen.getByRole("button", { name: "Reconnect Google" }));

    expect(signIn).toHaveBeenCalledWith("google", {
      callbackUrl: "/admin/diagnostics?mid=m-1&edit=1",
    });
    window.history.replaceState({}, "", "/");
  });
});
