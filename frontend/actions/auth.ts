"use server";

import { AuthorizationUrlRequest } from "@azure/msal-node";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loginRequest } from "../app/auth/authConfig";
import { authProvider } from "../services/auth";
import { getCurrentUrl } from "../app/auth/url";

async function acquireToken(
    request: Omit<AuthorizationUrlRequest, "redirectUri">
) {
    redirect(await authProvider.getAuthCodeUrl(request, getCurrentUrl()));
}

export async function login() {
    await acquireToken(loginRequest);
}

export async function getAccount() {
    return await authProvider.getAccount()
}

export async function logout() {
    const { instance, account } = await authProvider.authenticate();

    if (account) {
        await instance.getTokenCache().removeAccount(account);
    }

    cookies().delete("__session");
}