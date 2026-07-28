"use client";

import { PropsWithChildren } from "react";
import AppNavbar from "./components/organisms/AppNavbar";
import { Inter } from "next/font/google";
import styles from "../styles/MainLayout.module.scss";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { SidebarProvider } from "./context/SidebarContext";

const inter = Inter({ subsets: ["latin"] });

interface ClientLayoutProps {
    session: Session | null;
}

export default function ClientLayout({
    session,
    children,
}: PropsWithChildren<ClientLayoutProps>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head></head>
            <body className={inter.className} suppressHydrationWarning>
                <SessionProvider session={session}>
                    <SidebarProvider>
                        <div className={styles.mainlayout}>
                            <div className={styles.navigation}>
                                <AppNavbar />
                            </div>
                            <div className={styles.content}>
                                {children}
                            </div>
                        </div>
                    </SidebarProvider>
                </SessionProvider>
            </body>
        </html>
    );
}