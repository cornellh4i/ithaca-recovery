"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "../../components/atoms/Logo";
import CalendarNavbar from "../../components/organisms/CalendarNavbar";
import DailyView, { defaultRooms } from "../../components/organisms/DailyView";
import WeeklyView from "../../components/organisms/WeeklyView";
import { parseSignageFilters, parseSignageView } from "../../../util/signageFilters";
import navbarStyles from "../../../styles/components/organisms/AppNavbar.module.scss";

const REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const MIDNIGHT_CHECK_INTERVAL_MS = 30 * 1000;

const roomNames = defaultRooms.map(room => room.name);

export default function SignagePage() {
  return (
    <Suspense fallback={null}>
      <SignageContent />
    </Suspense>
  );
}

function SignageContent() {
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => parseSignageFilters(searchParams, roomNames),
    [searchParams]
  );
  // Seeded once from the URL; CalendarNavbar can still change it locally (e.g. if
  // the kiosk is touch-enabled), since it's the same navbar the interactive app uses.
  const [view, setView] = useState<'Day' | 'Week'>(() => parseSignageView(searchParams));

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Scale the whole page (header + calendar) together as one unit.
  // Day's timeline runs horizontally, so it scales to fit height. 
  // Week's timeline runs downward, so it scales to fit width.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const recalcScale = () => {
      if (view === "Day") {
        if (el.scrollHeight > 0) setScale(window.innerHeight / el.scrollHeight);
      } else if (el.scrollWidth > 0) {
        setScale(window.innerWidth / el.scrollWidth);
      }
    };

    recalcScale();
    const observer = new ResizeObserver(recalcScale);
    observer.observe(el);
    window.addEventListener("resize", recalcScale);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recalcScale);
    };
  }, [view, filters]);

  useEffect(() => {
    const id = setInterval(() => setRefreshTrigger(prev => prev + 1), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setSelectedDate(prev => {
        const now = new Date();
        return now.toDateString() !== prev.toDateString() ? now : prev;
      });
    }, MIDNIGHT_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const viewProps = {
    filters,
    selectedDate,
    setSelectedDate,
    setSelectedMeetingID: () => {}, // no-op: signage is read-only
    setSelectedNewMeeting: () => {}, // no-op: signage is read-only
    refreshTrigger,
  };

  return (
    <div style={{ height: "100vh", overflow: view === "Day" ? "hidden" : "auto" }}>
      <div
        ref={contentRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: `${100 / scale}%`,
        }}
      >
        <div className={navbarStyles.navbar}>
          <div className={navbarStyles.navcontainer}>
            <Logo />
          </div>
        </div>
        <CalendarNavbar
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          onViewChange={(v) => setView(v === "Week" ? "Week" : "Day")}
        />
        {view === "Day" ? <DailyView {...viewProps} /> : <WeeklyView {...viewProps} />}
      </div>
    </div>
  );
}
