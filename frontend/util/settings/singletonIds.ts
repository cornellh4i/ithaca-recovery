// Fixed primary-key values for LeaseSettings/MeetingExportSettings (see schema.prisma) --
// both models are singletons enforced by upserting on this exact id, so every read/write route
// must agree on the same literal rather than each hardcoding its own copy.
export const LEASE_SETTINGS_ID = "lease-settings";
export const MEETING_EXPORT_SETTINGS_ID = "meeting-export-settings";
