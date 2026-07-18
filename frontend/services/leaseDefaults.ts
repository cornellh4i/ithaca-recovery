import type { ILeaseSettings } from "../util/models";

// Ground-truth defaults: room rates/names match the current room list in util/rooms.ts;
// rental-agent/email wording ported from the pre-B.1 PandaDocButton.tsx — used until a
// Super Admin saves real settings.
export function defaultLeaseSettings(): ILeaseSettings {
  const currentYear = new Date().getFullYear();
  return {
    leaseStartDate: new Date(Date.UTC(currentYear, 6, 1)),
    leaseEndDate: new Date(Date.UTC(currentYear + 1, 5, 30)),
    rooms: [
      { room: "Serenity Room", rate: 15, unit: "hr" },
      { room: "Seeds of Hope Room", rate: 10, unit: "hr" },
      { room: "Unity Room", rate: 10, unit: "hr" },
      { room: "Room for Improvement", rate: 10, unit: "hr" },
      { room: "Room for Acceptance", rate: 10, unit: "hr" },
      { room: "Room for Gratitude", rate: 10, unit: "hr" },
      { room: "Zoom Only", rate: 10, unit: "month" },
    ],
    agentFirstName: "Rental",
    agentLastName: "Agent",
    agentTitle: "Rental Agent",
    agentEmail: "Rentals@518ICR.com",
    agentPhone: "(607) 216-8754",
    agentStreetAddress: "518 W Seneca St",
    agentCity: "Ithaca",
    agentState: "NY",
    agentZip: "14850",
    emailTemplate:
      "Hello {group}\n" +
      "Please find the link below to your lease. If you have any questions, please contact Rentals@518ICR.com with any questions.\n" +
      "If you have a rent reduction, this will need to be renewed. Please email Rentals@518ICR.com to request an extension.\n" +
      "Thank You\n" +
      "Ithaca Community Recovery",
  };
}
