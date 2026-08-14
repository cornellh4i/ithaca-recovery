import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { signIn } from "next-auth/react";
import AccessDeniedCard from "../../app/components/auth/AccessDeniedCard";

jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
}));

const mockSignIn = signIn as jest.Mock;

describe("AccessDeniedCard", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the access-denied heading and description", () => {
    render(<AccessDeniedCard />);

    expect(screen.getByRole("heading", { name: "Access denied" })).toBeVisible();
    expect(screen.getByText(/not authorized for this application/i)).toBeVisible();
  });

  it("starts a new Google sign-in with the account chooser forced and consent still required", () => {
    render(<AccessDeniedCard />);

    fireEvent.click(screen.getByRole("button", { name: "Sign in with a different account" }));

    // "consent" must stay alongside "select_account" -- authorizationParams replaces (not merges
    // with) authConfig.ts's own prompt, so dropping it would skip re-consent for an
    // already-authorized admin and omit refresh_token.
    expect(mockSignIn).toHaveBeenCalledWith("google", { callbackUrl: "/" }, { prompt: "select_account consent" });
  });
});
