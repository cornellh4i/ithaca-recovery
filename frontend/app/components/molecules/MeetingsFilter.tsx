import React, { useState } from 'react';
import LabeledCheckbox from '../atoms/checkbox/index';
import styles from '../../../styles/components/molecules/MeetingsFilter.module.scss';

const MeetingsFilter: React.FC = () => {
    // State to track the checked status of each filter
    const [filters, setFilters] = useState({
        SerenityRoom: false,
        SeedsOfHope: false,
        UnityRoom: false,
        RoomForImprovement: false,
        SmallButPowerfulRight: false,
        SmallButPowerfulLeft: false,
        ZoomAccount1: false,
        ZoomAccount2: false,
        ZoomAccount3: false,
        ZoomAccount4: false,
        AA: false,
        AlAnon: false,
        Other: false,
        InPerson: false,
        Hybrid: false
    });

    // Handler to update the filter state
    const handleCheckboxChange = (name: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilters({ ...filters, [name]: e.target.checked });
    };

    return (
        <div>
            <h3>Location</h3>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Serenity Room"
                    checked={filters.SerenityRoom}
                    onChange={handleCheckboxChange('SerenityRoom')}
                    color="#B3EA75"
                />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Seeds of Hope"
                    checked={filters.SeedsOfHope}
                    onChange={handleCheckboxChange('SeedsOfHope')}
                    color="#F7E57B"
                />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Unity Room"
                    checked={filters.UnityRoom}
                    onChange={handleCheckboxChange('UnityRoom')}
                    color="#96DBFE"
                />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Room for Improvement"
                    checked={filters.RoomForImprovement}
                    onChange={handleCheckboxChange('RoomForImprovement')}
                    color="#FFAE73"
                />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Small but Powerful - Right"
                    checked={filters.SmallButPowerfulRight}
                    onChange={handleCheckboxChange('SmallButPowerfulRight')}
                    color="#D2AFFF"
                />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Small but Powerful - Left"
                    checked={filters.SmallButPowerfulLeft}
                    onChange={handleCheckboxChange('SmallButPowerfulLeft')}
                    color="#FFA3C2"
                />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Zoom Account 1"
                    checked={filters.ZoomAccount1}
                    onChange={handleCheckboxChange('ZoomAccount1')}
                    color="#CECECE"
                />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Zoom Account 2"
                    checked={filters.ZoomAccount2}
                    onChange={handleCheckboxChange('ZoomAccount2')}
                    color="#CECECE"
                />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Zoom Account 3"
                    checked={filters.ZoomAccount3}
                    onChange={handleCheckboxChange('ZoomAccount3')}
                    color="#CECECE"
                />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Zoom Account 4"
                    checked={filters.ZoomAccount4}
                    onChange={handleCheckboxChange('ZoomAccount4')}
                    color="#CECECE"
                />
            </div>

            <h3>Calendar</h3>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="AA"
                    checked={filters.AA}
                    onChange={handleCheckboxChange('AA')}
                    color="#CC3366"
                />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Al-Anon"
                    checked={filters.AlAnon}
                    onChange={handleCheckboxChange('AlAnon')}
                    color="#CC3366"
                />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Other"
                    checked={filters.Other}
                    onChange={handleCheckboxChange('Other')}
                    color="#CC3366"
                />
            </div>

            <h3>Mode</h3>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="In Person"
                    checked={filters.InPerson}
                    onChange={handleCheckboxChange('InPerson')}
                    color="#CC3366"
                />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox 
                    label="Hybrid"
                    checked={filters.Hybrid}
                    onChange={handleCheckboxChange('Hybrid')}
                    color="#CC3366"
                />
            </div>
        </div>
    );
};

export default MeetingsFilter;
