import React, { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import styles from "../../../../styles/components/atoms/MiniCalendar.module.scss";


const MiniCalendar: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>();
    const [month, setMonth] = useState(new Date());

    const isOutsideDay = (date: Date) => {
        const selectedMonth = month.getMonth();
        return date.getMonth() !== selectedMonth; // Check if the month of the date is different from the current month
    };

    return (
        <div className={styles.container}>
            <DayPicker
                mode="single"
                selected={selectedDate}
                month={month}
                onMonthChange={setMonth}
                showOutsideDays
                onSelect={(date) => {
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
                defaultMonth={new Date(2024, 4)} // Starting month May 2024
                formatters={{
                    formatWeekdayName: (date) => {
                        return date.toLocaleDateString('en-US', { weekday: 'short' })[0];
                    },
                }}
            />
        </div>
    );
};

export default MiniCalendar;
