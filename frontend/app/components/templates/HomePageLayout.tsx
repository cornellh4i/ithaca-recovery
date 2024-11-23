"use client";
import React, { useContext, useState } from 'react';
import styles from "../../../styles/HomePageLayout.module.scss";
import CalendarSidebar from "../organisms/CalendarSidebar";
import DailyView from "../organisms/DailyView/index";

const HomePage = () => {
  const [filters, setFilters] = useState({
    SerenityRoom: true,
    SeedsofHope: true,
    UnityRoom: true,
    RoomforImprovement: true,
    SmallbutPowerfulRight: true,
    SmallbutPowerfulLeft: true,
    ZoomAccount1: true,
    ZoomAccount2: true,
    ZoomAccount3: true,
    ZoomAccount4: true,
    AA: true,
    AlAnon: true,
    Other: true,
    InPerson: true,
    Hybrid: true,
    Remote: true,
  });

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <CalendarSidebar 
          filters={filters}
          setFilters={setFilters}
        />
      </div>
      <div className={styles.primaryCalendar}>
        <DailyView filters={filters} />
      </div>
    </div>
  );
};

export default HomePage;
