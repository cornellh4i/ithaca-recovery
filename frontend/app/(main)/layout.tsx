import { PropsWithChildren } from "react";
import type { Metadata } from "next";
import { getAuth } from "../../services/auth";
import ClientLayout from "../ClientLayout";

export const metadata: Metadata = {
    title: "Main Calendar | Ithaca Community Recovery",
};

export default async function RootLayout({ children }: PropsWithChildren) {
    const session = await getAuth();

    return (
        <ClientLayout session={session}>
            {/* Lives here, NOT in DocsShell: pagefind-component-ui.js's module singleton keeps
                references into the first <pagefind-modal> it pairs with, and those references
                don't survive the element being unmounted and recreated -- a /docs -> elsewhere ->
                /docs client-side round trip previously left the docs search trigger flipping its
                own state but opening nothing (GitHub #477). This layout never unmounts within a
                (main) session, so the modal element (inert, display: none until opened; an
                unregistered no-op tag until the docs shell first injects the Pagefind script)
                mounts exactly once per real page load. The trigger stays in DocsShell -- fresh
                triggers pair correctly against a live modal. */}
            <pagefind-modal reset-on-close="true" />
            {children}
        </ClientLayout>
    );
}
