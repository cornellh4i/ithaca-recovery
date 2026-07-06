"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import DailyView, { defaultRooms } from "../../components/organisms/DailyView";
import WeeklyView from "../../components/organisms/WeeklyView";
import { parseSignageFilters, parseSignageView } from "../../../util/signageFilters";

const REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const MIDNIGHT_CHECK_INTERVAL_MS = 30 * 1000;

const roomNames = defaultRooms.map(room => room.name);

export default function SignagePage() {
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => parseSignageFilters(searchParams, roomNames),
    [searchParams]
  );
  const view = parseSignageView(searchParams);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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

  return view === "Day" ? <DailyView {...viewProps} /> : <WeeklyView {...viewProps} />;
}
