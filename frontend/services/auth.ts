import { getServerSession } from "next-auth";
import { authOptions } from "../app/api/auth/authConfig";

export async function getAuth() {
    return getServerSession(authOptions);
}
