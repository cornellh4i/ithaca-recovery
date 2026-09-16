import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../../services/auth";
import { syncOneMeeting } from "../../../../../services/syncOneMeeting";

const syncMeeting = async (request: Request): Promise<Response> => {
    try {
        const auth = await requireRole(Role.ADMIN);
        if (auth instanceof Response) return auth;
        if (!auth.accessToken) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        // The stored token is still present but dead, so letting this through would spend a
        // guaranteed 401 and overwrite the meeting's real failure reason with Google's.
        if (auth.googleAuthExpired) {
            return NextResponse.json({ error: "GoogleAuthExpired" }, { status: 409 });
        }

        const { mid } = await request.json();
        const result = await syncOneMeeting(mid, auth.accessToken);
        if (result.notFound) {
            return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
        }
        return NextResponse.json(result);
    } catch (error) {
        console.error("Sync retry error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
};

export { syncMeeting as POST };
