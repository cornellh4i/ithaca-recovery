import { parseImportRow } from "../../util/importParsing";

const baseRow = {
  "Meeting Name": "Test Meeting",
  Status: "Active",
  Category: "AA",
  Day: "M-W, F",
  Frequency: "Weekly",
  "Start Date": "07/06/2026", // a Monday
  "Start Time": "7:00 PM",
  "End Time": "8:00 PM",
  "Location Type": "In Person",
  "Physical Room": "Serenity Room",
  "Zoom Room": "",
  "Contact Email": "test@icr.org",
  Description: "",
};

describe("parseImportRow — general rules", () => {
  it("parses a straightforward weekly row", () => {
    const result = parseImportRow(baseRow, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.meeting.calType).toEqual(["AA"]);
    expect(result.row.meeting.room).toBe("Serenity Room");
    expect(result.row.meeting.modeType).toBe("In Person");
    expect(result.row.meeting.isRecurring).toBe(true);
    expect(result.row.recurrencePattern).toMatchObject({
      type: "weekly",
      daysOfWeek: ["Monday", "Tuesday", "Wednesday", "Friday"],
      interval: 1,
    });
  });

  it("treats a time without AM/PM as AM", () => {
    const result = parseImportRow({
      ...baseRow, Day: "", Frequency: "", "Start Time": "9:00", "End Time": "10:00",
    }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 9:00 AM ET on 07/06/2026 = 13:00 UTC (EDT, UTC-4)
    expect(result.row.meeting.startDateTime.toISOString()).toBe("2026-07-06T13:00:00.000Z");
    expect(result.row.meeting.endDateTime.toISOString()).toBe("2026-07-06T14:00:00.000Z");
  });

  it("treats 12:00 PM as noon", () => {
    const result = parseImportRow({
      ...baseRow, Day: "", Frequency: "", "Start Time": "12:00 PM", "End Time": "1:00 PM",
    }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Noon ET on 07/06/2026 = 16:00 UTC (EDT, UTC-4)
    expect(result.row.meeting.startDateTime.toISOString()).toBe("2026-07-06T16:00:00.000Z");
  });

  it('expands "Daily" to all 7 days', () => {
    const result = parseImportRow({ ...baseRow, Day: "Daily" }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.recurrencePattern?.daysOfWeek).toHaveLength(7);
  });

  it("falls back to Zoom Room when Physical Room is blank", () => {
    const result = parseImportRow({ ...baseRow, "Physical Room": "", "Zoom Room": "Serenity Room - Zoom" }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.meeting.room).toBe("Serenity Room - Zoom");
    expect(result.row.meeting.zoomRoom).toBe("Serenity Room - Zoom");
  });

  it("uses the first email when multiple are listed", () => {
    const result = parseImportRow({ ...baseRow, "Contact Email": "first@icr.org, second@icr.org" }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.meeting.email).toBe("first@icr.org");
  });

  it("parses a fixed day-of-month monthly pattern", () => {
    const result = parseImportRow({ ...baseRow, Day: "Day 15", Frequency: "Monthly" }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.recurrencePattern).toMatchObject({ type: "monthly", dayOfMonth: 15 });
  });

  it("parses a one-time (non-recurring) row", () => {
    const result = parseImportRow({ ...baseRow, Day: "One-time", Frequency: "" }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.meeting.isRecurring).toBe(false);
    expect(result.row.recurrencePattern).toBeNull();
  });

  it("prefixes errors with the row number", () => {
    const result = parseImportRow({ ...baseRow, "Meeting Name": "" }, 4);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/^Row 5: /);
  });

  it("errors when End Time is before Start Time", () => {
    const result = parseImportRow({ ...baseRow, "Start Time": "8:00 PM", "End Time": "7:00 PM" }, 0);
    expect(result.ok).toBe(false);
  });

  it("errors when neither Physical Room nor Zoom Room is set", () => {
    const result = parseImportRow({ ...baseRow, "Physical Room": "", "Zoom Room": "" }, 0);
    expect(result.ok).toBe(false);
  });

  it("errors on an unrecognized Day value", () => {
    const result = parseImportRow({ ...baseRow, Day: "Someday" }, 0);
    expect(result.ok).toBe(false);
  });
});

describe("parseImportRow — notable spreadsheet rows", () => {
  it("M006 Woman's Double Winners — two categories, two emails", () => {
    const result = parseImportRow({
      ...baseRow,
      "Meeting Name": "Woman's Double Winners",
      Category: "Al-Anon, AA",
      "Contact Email": "host1@icr.org, host2@icr.org",
    }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.meeting.calType).toEqual(["Al-Anon", "AA"]);
    expect(result.row.meeting.email).toBe("host1@icr.org");
  });

  it("M011 Al-Anon Intergroup — monthly (1st Tuesday), online-only, no physical room", () => {
    const result = parseImportRow({
      ...baseRow,
      "Meeting Name": "Al-Anon Intergroup",
      Category: "Al-Anon",
      Day: "1st Tu",
      Frequency: "Monthly",
      "Location Type": "Remote",
      "Physical Room": "",
      "Zoom Room": "Unity Room - Zoom",
    }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.meeting.modeType).toBe("Remote");
    expect(result.row.meeting.room).toBe("Unity Room - Zoom");
    expect(result.row.recurrencePattern).toMatchObject({
      type: "monthly", weekOfMonth: 1, daysOfWeek: ["Tuesday"],
    });
  });

  it("M017 11th Step — two categories, no Zoom room", () => {
    const result = parseImportRow({
      ...baseRow,
      "Meeting Name": "11th Step",
      Category: "AA, Other",
      "Zoom Room": "",
    }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.meeting.calType).toEqual(["AA", "Other"]);
    expect(result.row.meeting.zoomRoom).toBeNull();
  });

  it("M022 Recovering Couples — two categories, two emails", () => {
    const result = parseImportRow({
      ...baseRow,
      "Meeting Name": "Recovering Couples",
      Category: "AA, Other",
      "Contact Email": "host1@icr.org; host2@icr.org",
    }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.meeting.calType).toEqual(["AA", "Other"]);
    expect(result.row.meeting.email).toBe("host1@icr.org");
  });

  it('M028 Daily Ithaca Group — "Daily" expands to all 7 days', () => {
    const result = parseImportRow({ ...baseRow, "Meeting Name": "Daily Ithaca Group", Day: "Daily" }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.recurrencePattern?.daysOfWeek).toEqual([
      "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
    ]);
  });

  it("M029 AA District — monthly (1st Wednesday), Room for Improvement", () => {
    const result = parseImportRow({
      ...baseRow,
      "Meeting Name": "AA District",
      Day: "1st W",
      Frequency: "Monthly",
      "Physical Room": "Room for Improvement",
    }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.meeting.room).toBe("Room for Improvement");
    expect(result.row.recurrencePattern).toMatchObject({
      type: "monthly", weekOfMonth: 1, daysOfWeek: ["Wednesday"],
    });
  });
});
