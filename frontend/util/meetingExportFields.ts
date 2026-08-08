// Shared by the Export Meetings config UI and the export route itself, so the two can never
// drift on what a field key means or which group it belongs to. Meeting ID and Meeting Name
// are exported unconditionally and intentionally have no entry here -- they aren't a choice.

export type MeetingExportFieldKey =
  | "status"
  | "category"
  | "locationType"
  | "physicalRoom"
  | "zoomRoom"
  | "zoomLink"
  | "zoomHost"
  | "description"
  | "dayFrequency"
  | "startDate"
  | "startTime"
  | "endDate"
  | "endTime"
  | "contactEmail";

interface MeetingExportFieldGroup {
  group: string;
  fields: { key: MeetingExportFieldKey; label: string }[];
}

// Grouped by the three things an admin thinks in -- what the meeting is, when it happens, who
// to contact -- rather than one flat list of fourteen checkboxes.
export const MEETING_EXPORT_FIELD_GROUPS: MeetingExportFieldGroup[] = [
  {
    group: "Meeting",
    fields: [
      { key: "status", label: "Status" },
      { key: "category", label: "Category" },
      { key: "locationType", label: "Location Type" },
      { key: "physicalRoom", label: "Physical Room" },
      { key: "zoomRoom", label: "Zoom Room" },
      { key: "zoomLink", label: "Zoom Link" },
      { key: "zoomHost", label: "Zoom Host" },
      { key: "description", label: "Description" },
    ],
  },
  {
    group: "Schedule",
    fields: [
      { key: "dayFrequency", label: "Day / Frequency" },
      { key: "startDate", label: "Start Date" },
      { key: "startTime", label: "Start Time" },
      { key: "endDate", label: "End Date" },
      { key: "endTime", label: "End Time" },
    ],
  },
  {
    group: "Contact",
    fields: [
      { key: "contactEmail", label: "Contact Email" },
    ],
  },
];

export const ALL_MEETING_EXPORT_FIELD_KEYS: MeetingExportFieldKey[] =
  MEETING_EXPORT_FIELD_GROUPS.flatMap((g) => g.fields.map((f) => f.key));

const VALID_KEYS = new Set<string>(ALL_MEETING_EXPORT_FIELD_KEYS);

// Drops anything that isn't a currently-known field key -- guards against a stale saved
// selection referencing a field that's since been renamed or removed from the registry above.
export function sanitizeMeetingExportFields(fields: string[]): MeetingExportFieldKey[] {
  return fields.filter((f): f is MeetingExportFieldKey => VALID_KEYS.has(f));
}
