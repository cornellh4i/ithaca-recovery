import React from "react";
import styles from "../../../styles/HomePageLayout.module.scss"; 
import DailyView from "../organisms/DailyView/index";

const HomePage = () => {
  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>Sidebar</div>
      <div className={styles.primaryCalendar}><DailyView /></div>
    </div>
  );
};

export default HomePage;
