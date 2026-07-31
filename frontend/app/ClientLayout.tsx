"use client";

import { PropsWithChildren } from "react";
import AppNavbar from "./components/navbar/AppNavbar";
import { Inter } from "next/font/google";
import styles from "../styles/MainLayout.module.scss";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { SidebarProvider } from "./context/SidebarContext";
import { CalendarProvider, useCalendarContext } from "./context/CalendarProvider";

const inter = Inter({ subsets: ["latin"] });

interface ClientLayoutProps {
    session: Session | null;
}

// Slides .content's top padding shut in sync with MobileAppNavbar sliding away, so
// WeekStrip/CalendarHeader (normal-flow children further down the tree) ride up to fill
// exactly the gap the navbar vacates instead of leaving it empty. Has to be its own
// component, not inlined into ClientLayout below -- useCalendarContext() needs a
// CalendarProvider ancestor already mounted, which doesn't exist yet during ClientLayout's
// own render (the Provider below is still just JSX at that point).
function MainContent({ children }: PropsWithChildren) {
    const { navHidden } = useCalendarContext();
    return (
        <div className={`${styles.content} ${navHidden ? styles.navHidden : ""}`}>
            {children}
        </div>
    );
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
                        <CalendarProvider>
                            <div className={styles.mainlayout}>
                                <div className={styles.navigation}>
                                    <AppNavbar />
                                </div>
                                <MainContent>{children}</MainContent>
                            </div>
                        </CalendarProvider>
                    </SidebarProvider>
                </SessionProvider>
            </body>
        </html>
    );
}