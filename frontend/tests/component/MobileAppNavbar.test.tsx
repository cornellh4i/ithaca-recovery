import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import MobileAppNavbar from "../../app/components/navbar/MobileAppNavbar";
import { CalendarProvider, useCalendarContext } from "../../app/context/CalendarProvider";
import type { Session } from "next-auth";

jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

const mockUseSession = useSession as jest.Mock;
const mockUsePathname = usePathname as jest.Mock;

const adminSession: Session = {
  user: { name: "Admin User", email: "admin@example.com", role: "ADMIN" },
  expires: "2099-01-01T00:00:00.000Z",
};

// Renders the current context's selectedDate as text so tests can assert the Today button
// (and, in a later branch, swipe/mini-calendar transitions) actually mutated shared state,
// without reaching into MobileAppNavbar's own internals.
const SelectedDateProbe: React.FC = () => {
  const { selectedDate } = useCalendarContext();
  return <div data-testid="selected-date">{selectedDate.toDateString()}</div>;
};

const renderNavbar = () =>
  render(
    <CalendarProvider>
      <SelectedDateProbe />
      <MobileAppNavbar session={adminSession} status="authenticated" userAvatar={<div data-testid="avatar" />} />
    </CalendarProvider>
  );

// jsdom's default window size (1024x768) isn't phone-sized at all, so most tests below never
// trigger the landscape-only dropdown -- these two set it explicitly, matching
// BottomSheet.test.tsx's identical pattern for the same reason.
const withWindowSize = (width: number, height: number, run: () => void) => {
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  try {
    run();
  } finally {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
  }
};

describe("MobileAppNavbar", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders menu, calendar, filter, today, and profile buttons on the main calendar route", () => {
    mockUseSession.mockReturnValue({ data: adminSession });
    mockUsePathname.mockReturnValue("/");

    renderNavbar();

    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Navigate to a day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter meetings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
  });

  it("only renders menu and profile on a non-calendar route", () => {
    mockUseSession.mockReturnValue({ data: adminSession });
    mockUsePathname.mockReturnValue("/admin");

    renderNavbar();

    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Navigate to a day" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Filter meetings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();
  });

  it("opens a bottom sheet titled 'Navigate to this day' with a mini calendar", () => {
    mockUseSession.mockReturnValue({ data: adminSession });
    mockUsePathname.mockReturnValue("/");

    renderNavbar();
    fireEvent.click(screen.getByRole("button", { name: "Navigate to a day" }));

    expect(screen.getByRole("dialog", { name: "Navigate to this day" })).toBeInTheDocument();
  });

  it("sets selectedDate to today when the Today button is clicked", () => {
    mockUseSession.mockReturnValue({ data: adminSession });
    mockUsePathname.mockReturnValue("/");

    renderNavbar();
    fireEvent.click(screen.getByRole("button", { name: "Today" }));

    expect(screen.getByTestId("selected-date")).toHaveTextContent(new Date().toDateString());
  });

  it("shows no filter badge by default (all filters selected)", () => {
    mockUseSession.mockReturnValue({ data: adminSession });
    mockUsePathname.mockReturnValue("/");

    renderNavbar();

    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it("shows a pink badge with the unselected count after unchecking a filter", () => {
    mockUseSession.mockReturnValue({ data: adminSession });
    mockUsePathname.mockReturnValue("/");

    renderNavbar();
    fireEvent.click(screen.getByRole("button", { name: "Filter meetings" }));

    const sheet = screen.getByRole("dialog", { name: "Filter meetings" });
    const [firstCheckbox] = within(sheet).getAllByRole("checkbox");
    fireEvent.click(firstCheckbox);

    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("opens the profile bottom sheet with ProfileCard content for a signed-in user", () => {
    mockUseSession.mockReturnValue({ data: adminSession });
    mockUsePathname.mockReturnValue("/");

    renderNavbar();
    fireEvent.click(screen.getByRole("button", { name: "Account" }));

    expect(screen.getByRole("dialog", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByText("Hi, Admin User")).toBeInTheDocument();
  });

  it("has no Day/Multi-Day dropdown on a portrait phone", () => {
    mockUseSession.mockReturnValue({ data: adminSession });
    mockUsePathname.mockReturnValue("/");

    withWindowSize(390, 844, () => {
      renderNavbar();
      expect(screen.queryByRole("button", { name: "Day" })).not.toBeInTheDocument();
    });
  });

  it("shows a Day/Multi-Day dropdown, defaulted to Day, on a landscape phone", () => {
    mockUseSession.mockReturnValue({ data: adminSession });
    mockUsePathname.mockReturnValue("/");

    withWindowSize(844, 390, () => {
      renderNavbar();
      expect(screen.getByRole("button", { name: "Day" })).toBeInTheDocument();
    });
  });

  it("switches landscapeView to 'multiday' when Multi-Day is selected", () => {
    mockUseSession.mockReturnValue({ data: adminSession });
    mockUsePathname.mockReturnValue("/");

    withWindowSize(844, 390, () => {
      renderNavbar();
      fireEvent.click(screen.getByRole("button", { name: "Day" }));
      fireEvent.click(screen.getByRole("option", { name: "Multi-Day" }));

      expect(screen.getByRole("button", { name: "Multi-Day" })).toBeInTheDocument();
    });
  });
});
