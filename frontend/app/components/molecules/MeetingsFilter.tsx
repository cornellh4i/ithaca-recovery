"use client";

import React from 'react';
import LabeledCheckbox from '../atoms/CheckBox';
import styles from '../../../styles/components/molecules/MeetingsFilter.module.scss';

interface MeetingsFilterProps {
    filters: {
        SerenityRoom: boolean;
        SeedsofHopeRoom: boolean;
        UnityRoom: boolean;
        RoomforImprovement: boolean;
        RoomforAcceptance: boolean;
        RoomforGratitude: boolean;
        SerenityRoomZoom: boolean;
        SeedsofHopeRoomZoom: boolean;
        UnityRoomZoom: boolean;
        RoomforImprovementZoom: boolean;
        "Children'sRoom@518Zoom": boolean;
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
    const handleCheckboxChange = (name: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
        onFilterChange(name, e.target.checked);
    };

    return (
        <div>
            <h3>Location</h3>
            <div className={styles.checkbox}>
                <LabeledCheckbox label="Serenity Room" checked={filters.SerenityRoom} onChange={handleCheckboxChange('SerenityRoom')} color="#B3EA75" />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox label="Seeds of Hope Room" checked={filters.SeedsofHopeRoom} onChange={handleCheckboxChange('SeedsofHopeRoom')} color="#F7E57B" />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox label="Unity Room" checked={filters.UnityRoom} onChange={handleCheckboxChange('UnityRoom')} color="#96DBFE" />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox label="Room for Improvement" checked={filters.RoomforImprovement} onChange={handleCheckboxChange('RoomforImprovement')} color="#FFAE73" />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox label="Room for Acceptance" checked={filters.RoomforAcceptance} onChange={handleCheckboxChange('RoomforAcceptance')} color="#FFA3C2" />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox label="Room for Gratitude" checked={filters.RoomforGratitude} onChange={handleCheckboxChange('RoomforGratitude')} color="#D2AFFF" />
            </div>

            <h3>Zoom Rooms</h3>
            <div className={styles.checkbox}>
                <LabeledCheckbox label="Serenity Room - Zoom" checked={filters.SerenityRoomZoom} onChange={handleCheckboxChange('SerenityRoomZoom')} color="#CECECE" />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox label="Seeds of Hope Room - Zoom" checked={filters.SeedsofHopeRoomZoom} onChange={handleCheckboxChange('SeedsofHopeRoomZoom')} color="#CECECE" />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox label="Unity Room - Zoom" checked={filters.UnityRoomZoom} onChange={handleCheckboxChange('UnityRoomZoom')} color="#CECECE" />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox label="Room for Improvement - Zoom" checked={filters.RoomforImprovementZoom} onChange={handleCheckboxChange('RoomforImprovementZoom')} color="#CECECE" />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox label="Children's Room @ 518 - Zoom" checked={filters["Children'sRoom@518Zoom"]} onChange={handleCheckboxChange("Children'sRoom@518Zoom")} color="#CECECE" />
            </div>

            <h3>Calendar</h3>
            <div className={styles.checkbox}>
                <LabeledCheckbox label="AA" checked={filters.AA} onChange={handleCheckboxChange('AA')} color="#CC3366" />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox label="Al-Anon" checked={filters.AlAnon} onChange={handleCheckboxChange('AlAnon')} color="#CC3366" />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox label="Other" checked={filters.Other} onChange={handleCheckboxChange('Other')} color="#CC3366" />
            </div>

            <h3>Mode</h3>
            <div className={styles.checkbox}>
                <LabeledCheckbox label="In Person" checked={filters.InPerson} onChange={handleCheckboxChange('InPerson')} color="#CC3366" />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox label="Hybrid" checked={filters.Hybrid} onChange={handleCheckboxChange('Hybrid')} color="#CC3366" />
            </div>
            <div className={styles.checkbox}>
                <LabeledCheckbox label="Remote" checked={filters.Remote} onChange={handleCheckboxChange('Remote')} color="#CC3366" />
            </div>
        </div>
    );
};

export default MeetingsFilter;