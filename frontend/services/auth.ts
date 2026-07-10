import { getServerSession, Session } from "next-auth";
import { Role } from "@prisma/client";
import { authOptions } from "../app/api/auth/authConfig";

export async function getAuth() {
    return getServerSession(authOptions);
}

const roleRank: Record<Role, number> = {
    SUPER_ADMIN: 2,
    ADMIN: 1,
    USER: 0,
};

function jsonError(status: number, error: string) {
    return new Response(JSON.stringify({ error }), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

// Returns the session if it satisfies minRole, otherwise a ready-to-return
// 401/403 Response. Callers should check `instanceof Response` and return it directly.
export async function requireRole(minRole: Role): Promise<Session | Response> {
    const session = await getAuth();
    if (!session?.user?.role) {
        return jsonError(401, "Unauthorized");
    }
    if (roleRank[session.user.role] < roleRank[minRole]) {
        return jsonError(403, "Forbidden");
    }
    return session;
}
