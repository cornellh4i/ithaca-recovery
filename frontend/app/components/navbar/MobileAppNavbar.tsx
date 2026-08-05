"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import type { Session } from "next-auth";
import MenuIcon from "@mui/icons-material/Menu";
import FilterListIcon from "@mui/icons-material/FilterList";
import IconButton from "../atoms/IconButton";
import BottomSheet from "../atoms/BottomSheet";
import Dropdown from "../atoms/Dropdown";
import AppSidebar from "./AppSidebar";
import ProfileCard from "./ProfileCard";
import MobileLoginSheet from "./MobileLoginSheet";
import MiniCalendar from "../atoms/MiniCalendar";
import MeetingsFilter from "../calendar/shared/MeetingsFilter";
import { useCalendarContext } from "../../context/CalendarProvider";
import { useViewport } from "../../../hooks/useViewport";
import { toNoonETOnLocalCalendarDay } from "../../../util/weekDates";
import styles from "../../../styles/components/navbar/MobileAppNavbar.module.scss";

const LANDSCAPE_VIEW_LABELS = { day: "Day", multiday: "Multi-Day" } as const;
type LandscapeViewLabel = (typeof LANDSCAPE_VIEW_LABELS)[keyof typeof LANDSCAPE_VIEW_LABELS];
const LANDSCAPE_VIEW_BY_LABEL: Record<LandscapeViewLabel, "day" | "multiday"> = {
  Day: "day",
  "Multi-Day": "multiday",
};
// view_timeline / calendar_view_week (Material Symbols) -- stand in for the text label in the
// dropdown's own closed button (see .viewOptionText's display:none there in the module.scss),
// and sit in front of the label in the open list.
const LANDSCAPE_VIEW_ICONS: Record<LandscapeViewLabel, string> = {
  Day: "/svg/view-timeline-icon.svg",
  "Multi-Day": "/svg/calendar-view-week-icon.svg",
};

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
  const { selectedDate, changeSelectedDate, dayFilters, setDayFilters, navHidden, landscapeView, setLandscapeView } =
    useCalendarContext();
  const viewport = useViewport();
  const isLandscapePhone = viewport?.orientation === "landscape";

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const closeSheet = () => setOpenSheet(null);

  const unselectedFilterCount = Object.values(dayFilters).filter((value) => !value).length;
  const hasActiveFilters = unselectedFilterCount > 0;

  const handleFilterChange = (name: string, value: boolean) => {
    setDayFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleToday = () => changeSelectedDate(new Date());

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
              className={styles.squareIcon}
              onClick={() => setOpenSheet("calendar")}
            />
            <div className={styles.filterButtonWrapper}>
              <IconButton
                icon={<FilterListIcon />}
                ariaLabel="Filter meetings"
                variant="outlined"
                size="compact"
                className={[styles.squareIcon, hasActiveFilters ? styles.filterActive : undefined].filter(Boolean).join(" ")}
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
        {isCalendarRoute && isLandscapePhone && (
          <div className={styles.landscapeViewDropdown}>
            <Dropdown
              label=""
              value={LANDSCAPE_VIEW_LABELS[landscapeView]}
              isVisible={true}
              elements={["Day", "Multi-Day"]}
              name="Select view"
              onChange={(value) => setLandscapeView(LANDSCAPE_VIEW_BY_LABEL[value as LandscapeViewLabel])}
              renderElement={(element) => (
                <span className={styles.viewOption}>
                  <img
                    src={LANDSCAPE_VIEW_ICONS[element as LandscapeViewLabel]}
                    alt=""
                    className={styles.viewOptionIcon}
                  />
                  <span className={styles.viewOptionText}>{element}</span>
                </span>
              )}
            />
          </div>
        )}
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
          <button
            type="button"
            className={`${styles.profileButton} ${styles.profileButtonSignedOut}`}
            aria-label="Sign in"
            onClick={() => setLoginOpen(true)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 -960 960 960"
              fill="currentColor" // inherits .profileButtonSignedOut's black -- see .signInIcon's comment
              className={styles.signInIcon}
            >
              <path d="M480-120v-80h280v-560H480v-80h280q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H480Zm-80-160-55-58 102-102H120v-80h327L345-622l55-58 200 200-200 200Z" />
            </svg>
          </button>
        )}
      </div>

      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <BottomSheet isOpen={openSheet === "calendar"} onClose={closeSheet} title="Navigate to this day">
        <MiniCalendar
          selectedDate={selectedDate}
          onSelect={(date) => {
            // react-day-picker hands back a local-midnight-anchored Date -- re-anchor to
            // noon ET on that same calendar day before it flows into the shared transition
            // machinery (all of which assumes noon-ET-anchored Dates), or a runtime whose
            // local timezone isn't ET could land on the wrong day. See
            // toNoonETOnLocalCalendarDay's own comment.
            changeSelectedDate(toNoonETOnLocalCalendarDay(date));
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

      <MobileLoginSheet isOpen={loginOpen} onBack={() => setLoginOpen(false)} />
    </div>
  );
};

export default MobileAppNavbar;
