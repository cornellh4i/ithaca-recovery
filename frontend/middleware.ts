import { NextRequest, NextResponse } from "next/server";

// https://github.com/vercel/next.js/issues/43704#issuecomment-1411186664

export function middleware(request: NextRequest) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-url", request.url);

    return NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });
}

export const config = {
    matcher: ["/((?!_next|favicon.ico|api/).*)"],
};