import { z } from "zod";

// Zoom's `agenda` field (which the description is sent as, see services/zoom.ts's
// buildZoomMeetingBody) hard-caps at 1024 chars -- lower than Google Calendar's description
// limit, so a too-long description silently fails only the Zoom half of the sync. The form UI
// (hooks/useMeetingForm.ts) enforces this too; this is the server-side backstop.
export const DESCRIPTION_MAX_LENGTH = 1024;

// Shared by write/meeting and update/meeting — both expect the full IMeeting shape
// (update is a full replace, not a partial patch). Validates shape/types, plus the business
// rules hooks/useMeetingForm.ts's getValidationErrors enforces client-side (end > start, at
// least one calType, Hybrid/In-Person room requirements) -- the client form is not the only
// caller of these routes, so those rules need a server-side backstop too.
export const recurrencePatternSchema = z.object({
  mid: z.string().optional(),
  type: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  // Bounded to 520 (10 years of weekly occurrences) -- calculateEndDateFromOccurrences
  // (meetingOccurrences.ts) runs an unbounded-looking while loop over this count on the request
  // thread, before the write transaction even opens.
  numberOfOccurrences: z.number().int().min(1).max(520).nullable().optional(),
  daysOfWeek: z.array(z.string()).nullable().optional(),
  firstDayOfWeek: z.string(),
  interval: z.number(),
  weekOfMonth: z.number().nullable().optional(),
  dayOfMonth: z.number().nullable().optional(),
  excludedDates: z.array(z.coerce.date()).nullable().optional(),
});

export const meetingSchema = z.object({
  title: z.string().min(1),
  mid: z.string().min(1),
  description: z.string().max(DESCRIPTION_MAX_LENGTH),
  creator: z.string(),
  group: z.string(),
  startDateTime: z.coerce.date(),
  endDateTime: z.coerce.date(),
  email: z.email(),
  zoomRoom: z.string().nullable().optional(),
  zoomLink: z.string().nullable().optional(),
  zid: z.string().nullable().optional(),
  zoomPasscode: z.string().nullable().optional(),
  zoomInvitation: z.string().nullable().optional(),
  calType: z.array(z.string()),
  modeType: z.string(),
  room: z.string(),
  status: z.string().optional(),
  isRecurring: z.boolean(),
  // Set true to resubmit a payload that already saw (and was shown) a room/zoomRoom conflict --
  // must be declared here or zod strips it from safeParse's output (see
  // zoomHostAvailabilityCheckSchema's comment above for the same behavior).
  confirmOverride: z.boolean().optional(),
  recurrencePattern: recurrencePatternSchema.nullable().optional(),
  googleCalendarEventId: z.string().nullable().optional(),
  googleCalendarEventIds: z.record(z.string(), z.string()).nullable().optional(),
  googleSyncStatus: z.string().nullable().optional(),
  zoomCalendarEventId: z.string().nullable().optional(),
  zoomSyncStatus: z.string().nullable().optional(),
  zoomHost: z.string().nullable().optional(),
  zoomSyncError: z.string().nullable().optional(),
  deletedAt: z.coerce.date().nullable().optional(),
  updatedAt: z.coerce.date().nullable().optional(),
})
  .refine((meeting) => meeting.endDateTime > meeting.startDateTime, {
    message: "endDateTime must be after startDateTime.",
    path: ["endDateTime"],
  })
  .refine((meeting) => meeting.calType.length > 0, {
    message: "At least one calendar type is required.",
    path: ["calType"],
  })
  .refine(
    (meeting) => meeting.modeType !== "Hybrid" || (!!meeting.room && !!meeting.zoomRoom),
    {
      message: "Hybrid meetings require both a physical room and a Zoom room.",
      path: ["room"],
    },
  )
  .refine((meeting) => meeting.modeType !== "In Person" || !!meeting.room, {
    message: "In Person meetings require a physical room.",
    path: ["room"],
  });

// Narrower shape for the Zoom host-availability check — only the fields
// checkZoomHostPoolAvailability's OccurrenceInput actually needs. The client posts the same
// full buildMeetingPayload() object the real submit uses (no separate conversion logic), and
// zod strips the extra keys (title/email/etc.) rather than rejecting them.
export const zoomHostAvailabilityCheckSchema = z.object({
  mid: z.string().optional(),
  startDateTime: z.coerce.date(),
  endDateTime: z.coerce.date(),
  isRecurring: z.boolean(),
  recurrencePattern: recurrencePatternSchema.nullable().optional(),
});
