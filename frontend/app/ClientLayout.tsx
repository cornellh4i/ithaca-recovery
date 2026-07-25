"use client"

import { PropsWithChildren } from "react";
import AppNavbar from "./components/organisms/AppNavbar";
import { Inter } from "next/font/google";
import styles from "../styles/MainLayout.module.scss";
import type { Session } from "next-auth";
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
            <head>
            </head>
            {/* suppressHydrationWarning: some browser extensions (e.g. security/wallet
                extensions) inject attributes like bis_register onto <body> or <html> before React
                hydrates — a real mismatch, but not one our code can control or should warn on. */}
            <body className={inter.className} suppressHydrationWarning>
                <SidebarProvider>
                    <div className={styles.mainlayout}>
                        <div className={styles.navigation}>
                            <AppNavbar session={session} />
                        </div>
                        <div className={styles.content}>
                            {children}
                        </div>
                    </div>
                </SidebarProvider>
            </body>
        </html>
    );
}
