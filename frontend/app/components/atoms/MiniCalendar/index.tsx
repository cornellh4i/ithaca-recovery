import React, { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import styles from "../../../../styles/components/atoms/MiniCalendar.module.scss";

const MiniCalendar: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>();
    const [month, setMonth] = useState(new Date());

    return (
        <div className={styles.container}>
            <h2 className={styles.header}>Calendar</h2>

            <div className={styles.calendarContainer}>
                
                <DayPicker
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    month={month}
                    onMonthChange={setMonth}
                    showOutsideDays
                    classNames={{
                        month: styles.rdpMonth,
                        day: styles.day,
                        outside: styles.dayOutside,
                        selected: styles.selectedDay,
                        weekday: styles.weekday,
                        today: styles.today
                    }}
                    formatters={{
                        formatWeekdayName: (date) => {
                            return date.toLocaleDateString('en-US', { weekday: 'short' })[0];
                        },
                    }}
                />

            </div>
        </div>
    );
};

export default MiniCalendar;
