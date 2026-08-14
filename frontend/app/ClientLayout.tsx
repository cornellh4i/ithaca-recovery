"use client";

import { PropsWithChildren } from "react";
import AppNavigation from "./components/navigation/AppNavigation";
import { Inter } from "next/font/google";
import styles from "../styles/MainLayout.module.scss";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { SidebarProvider } from "./context/SidebarContext";
import { CalendarProvider, useCalendarContext } from "./context/CalendarProvider";
import { ToastProvider } from "./components/shared/ToastProvider";
import { useScrollNavHide } from "../hooks/useScrollNavHide";

const inter = Inter({ subsets: ["latin"] });

interface ClientLayoutProps {
    session: Session | null;
}

// Slides .content's top padding shut in sync with MobileAppNavigation sliding away, so
// WeekStrip/CalendarHeader (normal-flow children further down the tree) ride up to fill
// exactly the gap the navbar vacates instead of leaving it empty. Has to be its own
// component, not inlined into ClientLayout below -- useCalendarContext() needs a
// CalendarProvider ancestor already mounted, which doesn't exist yet during ClientLayout's
// own render (the Provider below is still just JSX at that point).
//
// onScroll wires the same mobile hide-on-scroll-down/show-on-scroll-up behavior the calendar
// route already had (there, via its own DayColumn/DayPortraitView wrapper) onto .content
// itself, so routes that actually scroll .content get it too. Harmless on routes where it
// doesn't: .content never scrolls on the calendar route (children manage their own internal
// scroll region) or on /docs (DocsShell's own independently-scrolling panes reattach this same
// hook to .article instead, see DocsShell.tsx), so this handler simply never fires there -- no
// conflict with either route's own dedicated listener.
function MainContent({ children }: PropsWithChildren) {
    const { navHidden } = useCalendarContext();
    const { handleScroll } = useScrollNavHide();
    return (
        <div className={`${styles.content} ${navHidden ? styles.navHidden : ""}`} onScroll={handleScroll}>
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
                            <ToastProvider>
                                <div className={styles.mainlayout}>
                                    <div className={styles.navigation}>
                                        <AppNavigation />
                                    </div>
                                    <MainContent>{children}</MainContent>
                                </div>
                            </ToastProvider>
                        </CalendarProvider>
                    </SidebarProvider>
                </SessionProvider>
            </body>
        </html>
    );
}