import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { signIn } from "next-auth/react";
import AccessDeniedCard from "../../app/components/navbar/AccessDeniedCard";

jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
}));

const mockSignIn = signIn as jest.Mock;

describe("AccessDeniedCard", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the access-denied heading and description", () => {
    render(<AccessDeniedCard email="jrivera@ithacarecovery.org" />);

    expect(screen.getByRole("heading", { name: "Access denied" })).toBeVisible();
    expect(screen.getByText(/not authorized for this application/i)).toBeVisible();
  });

  it("shows who is signed in when an email is provided", () => {
    render(<AccessDeniedCard email="jrivera@ithacarecovery.org" />);

    expect(screen.getByText("jrivera@ithacarecovery.org")).toBeVisible();
  });

  it("omits the signed-in-as line when no email is provided", () => {
    render(<AccessDeniedCard email="" />);

    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument();
  });

  it("starts a new Google sign-in with the account chooser forced when clicked", () => {
    render(<AccessDeniedCard email="jrivera@ithacarecovery.org" />);

    fireEvent.click(screen.getByRole("button", { name: "Sign in with a different account" }));

    expect(mockSignIn).toHaveBeenCalledWith("google", { callbackUrl: "/" }, { prompt: "select_account" });
  });
});
