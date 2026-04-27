"use client"

import { PropsWithChildren } from "react";
import Navigation from "./components/navigation";
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
                        <Navigation session={session} />
                    </div>
                    {children}
                </div>
            </body>
        </html>
    );
}
