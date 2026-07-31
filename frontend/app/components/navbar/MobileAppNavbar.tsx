"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Session } from "next-auth";
import MenuIcon from "@mui/icons-material/Menu";
import FilterListIcon from "@mui/icons-material/FilterList";
import IconButton from "../atoms/IconButton";
import BottomSheet from "../atoms/BottomSheet";
import AppSidebar from "./AppSidebar";
import ProfileCard from "./ProfileCard";
import MiniCalendar from "../atoms/MiniCalendar";
import MeetingsFilter from "../calendar/MeetingsFilter";
import { useCalendarContext } from "../../context/CalendarProvider";
import styles from "../../../styles/components/navbar/MobileAppNavbar.module.scss";

type OpenSheet = "calendar" | "filter" | "profile" | null;

interface MobileAppNavbarProps {
  session: Session | null;
  status: "loading" | "authenticated" | "unauthenticated";
  userAvatar: React.ReactNode;
}

// Rendered in place of the desktop AppNavbar at phone widths (see AppNavbar.tsx's
// useIsPhone() branch). Mounted globally (every route, via ClientLayout.tsx), so the menu
// toggle and profile button always render; the calendar/filter/Today controls are scoped to
// the main calendar route only, mirroring how CalendarNavbar today is likewise only ever
// mounted from app/(main)/page.tsx, never globally.
const MobileAppNavbar: React.FC<MobileAppNavbarProps> = ({ session, status, userAvatar }) => {
  const pathname = usePathname();
  const isCalendarRoute = pathname === "/";
  const { selectedDate, setSelectedDate, dayFilters, setDayFilters, navHidden } = useCalendarContext();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
  const closeSheet = () => setOpenSheet(null);

  const unselectedFilterCount = Object.values(dayFilters).filter((value) => !value).length;
  const hasActiveFilters = unselectedFilterCount > 0;

  const handleFilterChange = (name: string, value: boolean) => {
    setDayFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleToday = () => setSelectedDate(new Date());

  return (
    <div className={`${styles.navbar} ${navHidden ? styles.hidden : ""}`}>
      <div className={styles.left}>
        <IconButton
          icon={<MenuIcon />}
          ariaLabel="Open menu"
          variant="ghost"
          onClick={() => setSidebarOpen(true)}
        />
        {isCalendarRoute && (
          <React.Fragment>
            <IconButton
              icon={<img src="/svg/calendar-icon.svg" alt="" />}
              ariaLabel="Navigate to a day"
              variant="outlined"
              size="compact"
              onClick={() => setOpenSheet("calendar")}
            />
            <div className={styles.filterButtonWrapper}>
              <IconButton
                icon={<FilterListIcon />}
                ariaLabel="Filter meetings"
                variant="outlined"
                size="compact"
                className={hasActiveFilters ? styles.filterActive : undefined}
                onClick={() => setOpenSheet("filter")}
              />
              {hasActiveFilters && (
                <span className={styles.filterBadge}>{unselectedFilterCount}</span>
              )}
            </div>
          </React.Fragment>
        )}
      </div>

      <div className={styles.right}>
        {isCalendarRoute && (
          <button type="button" className={styles.todayButton} onClick={handleToday}>
            Today
          </button>
        )}
        {status === "loading" ? (
          <div className={styles.profileButton} style={{ opacity: 0, pointerEvents: "none" }} />
        ) : session && session.user ? (
          <button
            type="button"
            className={styles.profileButton}
            aria-label="Account"
            onClick={() => setOpenSheet("profile")}
          >
            {userAvatar}
          </button>
        ) : (
          <Link href="/login" className={styles.profileButton} aria-label="Sign in">
            {userAvatar}
          </Link>
        )}
      </div>

      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <BottomSheet isOpen={openSheet === "calendar"} onClose={closeSheet} title="Navigate to this day">
        <MiniCalendar
          selectedDate={selectedDate}
          onSelect={(date) => {
            setSelectedDate(date);
            closeSheet();
          }}
        />
      </BottomSheet>

      <BottomSheet isOpen={openSheet === "filter"} onClose={closeSheet} title="Filter meetings">
        <MeetingsFilter filters={dayFilters} onFilterChange={handleFilterChange} />
      </BottomSheet>

      {session && (
        <BottomSheet isOpen={openSheet === "profile"} onClose={closeSheet} title="Account">
          <ProfileCard session={session} userAvatar={userAvatar} />
        </BottomSheet>
      )}
    </div>
  );
};

export default MobileAppNavbar;
