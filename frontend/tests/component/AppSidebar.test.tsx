import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import AppSidebar from "../../app/components/navbar/AppSidebar";

jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

const mockUseSession = useSession as jest.Mock;
const mockUsePathname = usePathname as jest.Mock;

describe("AppSidebar", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing when isOpen is false", () => {
    mockUseSession.mockReturnValue({ data: null });
    mockUsePathname.mockReturnValue("/");

    render(<AppSidebar isOpen={false} onClose={jest.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("highlights Main Calendar as active on /", () => {
    mockUseSession.mockReturnValue({ data: null });
    mockUsePathname.mockReturnValue("/");

    render(<AppSidebar isOpen onClose={jest.fn()} />);

    expect(screen.getByRole("link", { name: "Main Calendar" }).className).toMatch(/active/);
  });

  it("shows a real Admin link, highlighted, for an admin user", () => {
    mockUseSession.mockReturnValue({ data: { user: { name: "Admin User", role: "ADMIN" } } });
    mockUsePathname.mockReturnValue("/admin");

    render(<AppSidebar isOpen onClose={jest.fn()} />);

    const adminLink = screen.getByRole("link", { name: "Admin" });
    expect(adminLink).toHaveAttribute("href", "/admin");
    expect(adminLink.className).toMatch(/active/);
  });

  it("hides the Admin link entirely for a signed-in non-admin", () => {
    mockUseSession.mockReturnValue({ data: { user: { name: "Regular User", role: "USER" } } });
    mockUsePathname.mockReturnValue("/");

    render(<AppSidebar isOpen onClose={jest.fn()} />);

    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("hides the Admin link and shows a Sign In link to /login for a signed-out visitor", () => {
    mockUseSession.mockReturnValue({ data: null });
    mockUsePathname.mockReturnValue("/");

    render(<AppSidebar isOpen onClose={jest.fn()} />);

    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute("href", "/login");
  });

  it("does not show a Signage link", () => {
    mockUseSession.mockReturnValue({ data: null });
    mockUsePathname.mockReturnValue("/");

    render(<AppSidebar isOpen onClose={jest.fn()} />);

    expect(screen.queryByRole("link", { name: "Signage" })).not.toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", () => {
    mockUseSession.mockReturnValue({ data: null });
    mockUsePathname.mockReturnValue("/");
    const onClose = jest.fn();

    render(<AppSidebar isOpen onClose={onClose} />);
    fireEvent.click(document.body.querySelector('[class*="backdrop"]') as Element);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when a nav row is tapped", () => {
    mockUseSession.mockReturnValue({ data: null });
    mockUsePathname.mockReturnValue("/admin");
    const onClose = jest.fn();

    render(<AppSidebar isOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole("link", { name: "Main Calendar" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
