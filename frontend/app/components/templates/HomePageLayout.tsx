"use client";
import React, { useContext, useState } from 'react';
import styles from "../../../styles/HomePageLayout.module.scss";
import CalendarSidebar from "../organisms/CalendarSidebar";
import DailyView from "../organisms/DailyView/index";

const HomePage = () => {
  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <CalendarSidebar />
      </div>
      <div className={styles.primaryCalendar}>
        <DailyView />
      </div>
    </div>
  );
};

export default HomePage;
