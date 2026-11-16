import { hasZoomCredentialDrift } from "../../util/meetings/zoomDrift";

const stored = { zoomLink: "https://us02web.zoom.us/j/85760961749?pwd=abc", zoomPasscode: "serenity" };

test("a domain-only change is not drift", () => {
  expect(hasZoomCredentialDrift(
    { joinUrl: "https://518icr.zoom.us/j/85760961749?pwd=abc", passcode: "serenity" }, stored,
  )).toBe(false);
});

test("a different meeting ID is drift", () => {
  expect(hasZoomCredentialDrift(
    { joinUrl: "https://us02web.zoom.us/j/81303529023?pwd=abc", passcode: "serenity" }, stored,
  )).toBe(true);
});

test("a rewritten pwd is drift", () => {
  expect(hasZoomCredentialDrift(
    { joinUrl: "https://518icr.zoom.us/j/85760961749?pwd=xyz", passcode: "serenity" }, stored,
  )).toBe(true);
});

test("a passcode-only change is drift", () => {
  expect(hasZoomCredentialDrift(
    { joinUrl: "https://us02web.zoom.us/j/85760961749?pwd=abc", passcode: "unity" }, stored,
  )).toBe(true);
});

test("an empty stored passcode matches Zoom's normalized passcode-less null", () => {
  expect(hasZoomCredentialDrift(
    { joinUrl: "https://zoom.us/j/1", passcode: null }, { zoomLink: "https://zoom.us/j/1", zoomPasscode: "" },
  )).toBe(false);
});

test("an unparseable stored link compares verbatim", () => {
  expect(hasZoomCredentialDrift(
    { joinUrl: "https://zoom.us/j/1", passcode: null }, { zoomLink: "zoom.us/j/1", zoomPasscode: null },
  )).toBe(true);
});
