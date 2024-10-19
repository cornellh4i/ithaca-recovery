import React from "react";
import styles from "../../../styles/HomePageLayout.module.scss"; 

const HomePage = () => {
  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>Sidebar</div>
      <div className={styles.primaryCalendar}>Primary Calendar</div>
    </div>
  );
};

export default HomePage;
