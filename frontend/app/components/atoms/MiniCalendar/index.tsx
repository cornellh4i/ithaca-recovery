import React, { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import styles from "../../../../styles/components/atoms/MiniCalendar.module.scss";

const MiniCalendar: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>();

    return (
        <div style={{ padding: '12px', backgroundColor: '#FFF', borderRadius: '4px', width: 'fit-content' }}>
            {}
            <h2 style={{ textAlign: 'center', fontSize: '1em', fontWeight: 'bold' }}>Calendar</h2>

            {}
            <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
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
    );
};

export default MiniCalendar;
