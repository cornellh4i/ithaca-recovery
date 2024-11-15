import React, { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import styles from "../../../../styles/components/atoms/MiniCalendar.module.scss";


const MiniCalendar: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const isOutsideDay = (date: Date) => {
        const selectedMonth = currentMonth.getMonth();
        return date.getMonth() !== selectedMonth; // Check if the month of the date is different from the current month
    };

    return (
        <div className={styles.container}>
            <DayPicker
                mode="single"
                selected={selectedDate}
                month={currentMonth}
                onMonthChange={setCurrentMonth}
                showOutsideDays={true}
                onSelect={(date: Date) => {
                    // Check if the date is valid and not an outside day
                    if (date && !isOutsideDay(date)) {
                        setSelectedDate(date);
                    }
                }}
                className={styles.rdpMonth}
                modifiersClassNames={{
                    selected: styles.selectedDay,
                    outside: styles.dayOutside,
                    today: styles.today,
                }}
                defaultMonth={currentMonth}
                formatters={{
                    formatWeekdayName: (date: Date) => {
                        return date.toLocaleDateString('en-US', { weekday: 'short' })[0];
                    },
                }}
                required
            />
        </div>
    );
};

export default MiniCalendar;
