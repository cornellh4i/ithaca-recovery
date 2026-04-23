import { PropsWithChildren } from "react";
import { getAuth } from "../services/auth";
import ClientLayout from "./ClientLayout";

export default async function RootLayout({ children }: PropsWithChildren) {
    const session = await getAuth();

    return (
        <ClientLayout session={session}>
            {children}
        </ClientLayout>
    );
}
