// This is a server component
import { headers } from "next/headers";

export function getCurrentUrl() {
    const headersList = headers();

    // read the custom x-url header
    return headersList.get("x-url") || "";
}
