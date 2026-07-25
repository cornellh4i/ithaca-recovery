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
            {children}
        </ClientLayout>
    );
}
