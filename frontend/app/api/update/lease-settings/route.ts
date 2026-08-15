import { NextResponse } from "next/server";
import { Role, Prisma } from "@prisma/client";
import { requireRole } from "../../../../services/auth";
import type { ILeaseSettings } from "../../../../types/models";
import { LEASE_SETTINGS_ID } from "../../../../util/settings/singletonIds";
import { prisma } from "../../../../lib/prisma";

// Singleton settings document, enforced by upserting on the fixed id (see schema.prisma)
// rather than a read-then-create -- that race could otherwise create two rows under
// concurrent initial writes.
export const PUT = async (request: Request) => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const body = await request.json() as ILeaseSettings;
    const leaseStartDate = new Date(body.leaseStartDate);
    const leaseEndDate = new Date(body.leaseEndDate);

    if (leaseStartDate >= leaseEndDate) {
      return NextResponse.json({ error: "Lease start date must be before the end date." }, { status: 400 });
    }

    const data = {
      leaseStartDate,
      leaseEndDate,
      rooms: body.rooms as unknown as Prisma.InputJsonValue,
      agentFirstName: body.agentFirstName,
      agentLastName: body.agentLastName,
      agentTitle: body.agentTitle,
      agentEmail: body.agentEmail,
      agentPhone: body.agentPhone,
      agentStreetAddress: body.agentStreetAddress,
      agentCity: body.agentCity,
      agentState: body.agentState,
      agentZip: body.agentZip,
      emailTemplate: body.emailTemplate,
    };

    const saved = await prisma.leaseSettings.upsert({
      where: { id: LEASE_SETTINGS_ID },
      update: data,
      create: { id: LEASE_SETTINGS_ID, ...data },
    });

    return NextResponse.json(saved);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};
