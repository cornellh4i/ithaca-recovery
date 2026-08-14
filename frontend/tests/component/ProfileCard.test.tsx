import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Session } from "next-auth";
import { signOut } from "next-auth/react";
import ProfileCard from "../../app/components/auth/ProfileCard";

jest.mock("next-auth/react", () => ({
  signOut: jest.fn(),
}));

const buildSession = (role: "SUPER_ADMIN" | "ADMIN" | "USER"): Session => ({
  user: { name: "Jamie Rivera", email: "jamie@example.com", role },
  expires: "2099-01-01T00:00:00.000Z",
});

describe("ProfileCard", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders name, email, and role", () => {
    render(<ProfileCard session={buildSession("ADMIN")} userAvatar={<div data-testid="avatar" />} />);

    expect(screen.getByText("Hi, Jamie Rivera")).toBeInTheDocument();
    expect(screen.getByText("jamie@example.com")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByTestId("avatar")).toBeInTheDocument();
  });

  it("renders 'Super Admin' and 'User' role labels correctly", () => {
    const { rerender } = render(
      <ProfileCard session={buildSession("SUPER_ADMIN")} userAvatar={null} />
    );
    expect(screen.getByText("Super Admin")).toBeInTheDocument();

    rerender(<ProfileCard session={buildSession("USER")} userAvatar={null} />);
    expect(screen.getByText("User")).toBeInTheDocument();
  });

  it("calls next-auth signOut by default when the sign-out button is clicked", () => {
    render(<ProfileCard session={buildSession("ADMIN")} userAvatar={null} />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });

  it("calls a supplied onSignOut instead of next-auth signOut when provided", () => {
    const onSignOut = jest.fn();
    render(<ProfileCard session={buildSession("ADMIN")} userAvatar={null} onSignOut={onSignOut} />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(onSignOut).toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});
