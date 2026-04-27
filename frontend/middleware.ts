import { NextRequest, NextResponse } from "next/server";

// https://github.com/vercel/next.js/issues/43704#issuecomment-1411186664

export async function middleware(request: NextRequest) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-url", request.url);

    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });

    const session = request.cookies.get("__session");
    if (session) {
        await fetch(new URL("/api/auth/refresh", request.url), {
            headers: { cookie: request.headers.get("cookie") ?? "" },
        });

        response.cookies.set("__session", session.value, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24 * 30,
            path: "/",
        });
    }

    return response;
}

export const config = {
    matcher: ["/((?!_next|favicon.ico|api/).*)"],
};