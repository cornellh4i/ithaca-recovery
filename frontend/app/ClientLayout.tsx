"use client"

import { PropsWithChildren } from "react";
import AppNavbar from "./components/organisms/AppNavbar";
import { Inter } from "next/font/google";
import styles from "../styles/MainLayout.module.scss";
import type { Session } from "next-auth";

const inter = Inter({ subsets: ["latin"] });

interface ClientLayoutProps {
    session: Session | null;
}

export default function ClientLayout({
    session,
    children,
}: PropsWithChildren<ClientLayoutProps>) {
    return (
        <html lang="en">
            <head>
            </head>
            <body className={inter.className}>
                <div className={styles.mainlayout}>
                    <div className={styles.navigation}>
                        <AppNavbar session={session} />
                    </div>
                    <div className={styles.content}>
                        {children}
                    </div>
                </div>
            </body>
        </html>
    );
}
