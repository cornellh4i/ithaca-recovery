"use client";
import React, { useContext, useState } from 'react';
import styles from "../../../styles/HomePageLayout.module.scss";
import CalendarSidebar from "../organisms/CalendarSidebar";

const HomePage = () => {
  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <CalendarSidebar />
      </div>
      <div className={styles.primaryCalendar}>Primary Calendar</div>
    </div>
  );
};

export default HomePage;
