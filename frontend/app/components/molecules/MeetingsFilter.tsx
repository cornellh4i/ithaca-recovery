"use client";

import React, { useState, useEffect } from 'react';
import LabeledCheckbox from '../atoms/checkbox/index';
import styles from '../../../styles/components/molecules/MeetingsFilter.module.scss';

interface MeetingsFilterProps {
    filters: {
        SerenityRoom: boolean;
        SeedsofHope: boolean;
        UnityRoom: boolean;
        RoomforImprovement: boolean;
        SmallbutPowerfulRight: boolean;
        SmallbutPowerfulLeft: boolean;
        ZoomSerenityRoom: boolean;
        ZoomSeedsofHope: boolean;
        ZoomUnityRoom: boolean;
        ZoomRoomforImprovement: boolean;
        AA: boolean;
        AlAnon: boolean;
        Other: boolean;
        InPerson: boolean;
        Hybrid: boolean;
        Remote: boolean;
    };
    onFilterChange: (name: string, value: boolean) => void;
}

const MeetingsFilter: React.FC<MeetingsFilterProps> = ({ filters, onFilterChange }) => {
    // State to track the checked status of each filter

    // Handler to update the filter state
    const handleCheckboxChange = (name: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
        onFilterChange(name, e.target.checked);
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
                    checked={filters.SeedsofHope}
                    onChange={handleCheckboxChange('SeedsofHope')}
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
                    checked={filters.RoomforImprovement}
                    onChange={handleCheckboxChange('RoomforImprovement')}
                    color="#FFAE73"
                />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Small but Powerful - Right"
                    checked={filters.SmallbutPowerfulRight}
                    onChange={handleCheckboxChange('SmallbutPowerfulRight')}
                    color="#D2AFFF"
                />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Small but Powerful - Left"
                    checked={filters.SmallbutPowerfulLeft}
                    onChange={handleCheckboxChange('SmallbutPowerfulLeft')}
                    color="#FFA3C2"
                />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Zoom - Serenity Room"
                    checked={filters.ZoomSerenityRoom}
                    onChange={handleCheckboxChange('ZoomSerenityRoom')}
                    color="#CECECE"
                />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Zoom - Seeds of Hope"
                    checked={filters.ZoomSeedsofHope}
                    onChange={handleCheckboxChange('ZoomSeedsofHope')}
                    color="#CECECE"
                />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Zoom - Unity Room"
                    checked={filters.ZoomUnityRoom}
                    onChange={handleCheckboxChange('ZoomUnityRoom')}
                    color="#CECECE"
                />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Zoom - Room for Improvement"
                    checked={filters.ZoomRoomforImprovement}
                    onChange={handleCheckboxChange('ZoomRoomforImprovement')}
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
            <div className={styles.checkbox}>
                <LabeledCheckbox
                    label="Remote"
                    checked={filters.Remote}
                    onChange={handleCheckboxChange('Remote')}
                    color="#CC3366"
                />
            </div>
        </div>
    );
};

export default MeetingsFilter;
