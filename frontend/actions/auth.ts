"use server";

import { redirect } from "next/navigation";
import { getAuth } from "../services/auth";

export async function login() {
    redirect("/api/auth/signin/google");
}

export async function getAccount() {
    const session = await getAuth();
    return session?.user ?? null;
}

export async function logout() {
    redirect("/api/auth/signout");
}
