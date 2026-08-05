import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MobileFab from "../../app/components/calendar/mobile/MobileFab";

describe("MobileFab", () => {
  it("renders a New meeting button and calls onClick when tapped", () => {
    const onClick = jest.fn();
    render(<MobileFab onClick={onClick} />);

    fireEvent.click(screen.getByRole("button", { name: "New meeting" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
