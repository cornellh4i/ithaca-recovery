import React, { useState } from 'react';
import LabeledCheckbox from '../atoms/checkbox/index';

const MeetingsFilter: React.FC = () => {
    // State to track the checked status of each filter
    const [filters, setFilters] = useState({
        SerenityRoom: true,
        SeedsOfHope: true,
        UnityRoom: true,
        RoomForImprovement: true,
        SmallButPowerfulRight: true,
        SmallButPowerfulLeft: true,
        ZoomAccount1: false,
        ZoomAccount2: false,
        ZoomAccount3: false,
        ZoomAccount4: false,
        AA: true,
        AlAnon: true,
        Other: true,
        InPerson: true,
        Hybrid: true
    });

    // Handler to update the filter state
    const handleCheckboxChange = (name: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilters({ ...filters, [name]: e.target.checked });
    };

    return (
        <div>
            <h3>Location</h3>
            <LabeledCheckbox
                label="Serenity Room"
                checked={filters.SerenityRoom}
                onChange={handleCheckboxChange('SerenityRoom')}
                color="#B6E5A3"
            />
            <LabeledCheckbox
                label="Seeds of Hope"
                checked={filters.SeedsOfHope}
                onChange={handleCheckboxChange('SeedsOfHope')}
                color="#FFEC84"
            />
            <LabeledCheckbox
                label="Unity Room"
                checked={filters.UnityRoom}
                onChange={handleCheckboxChange('UnityRoom')}
                color="#A3DFFF"
            />
            <LabeledCheckbox
                label="Room for Improvement"
                checked={filters.RoomForImprovement}
                onChange={handleCheckboxChange('RoomForImprovement')}
                color="#FFB383"
            />
            <LabeledCheckbox
                label="Small but Powerful - Right"
                checked={filters.SmallButPowerfulRight}
                onChange={handleCheckboxChange('SmallButPowerfulRight')}
                color="#D3A3FF"
            />
            <LabeledCheckbox
                label="Small but Powerful - Left"
                checked={filters.SmallButPowerfulLeft}
                onChange={handleCheckboxChange('SmallButPowerfulLeft')}
                color="#FFB3B3"
            />
            <LabeledCheckbox
                label="Zoom Account 1"
                checked={filters.ZoomAccount1}
                onChange={handleCheckboxChange('ZoomAccount1')}
                color="#D3D3D3"
            />
            <LabeledCheckbox
                label="Zoom Account 2"
                checked={filters.ZoomAccount2}
                onChange={handleCheckboxChange('ZoomAccount2')}
                color="#D3D3D3"
            />
            <LabeledCheckbox
                label="Zoom Account 3"
                checked={filters.ZoomAccount3}
                onChange={handleCheckboxChange('ZoomAccount3')}
                color="#D3D3D3"
            />
            <LabeledCheckbox
                label="Zoom Account 4"
                checked={filters.ZoomAccount4}
                onChange={handleCheckboxChange('ZoomAccount4')}
                color="#D3D3D3"
            />

            <h3>Calendar</h3>
            <LabeledCheckbox
                label="AA"
                checked={filters.AA}
                onChange={handleCheckboxChange('AA')}
                color="#B90076"
            />
            <LabeledCheckbox
                label="Al-Anon"
                checked={filters.AlAnon}
                onChange={handleCheckboxChange('AlAnon')}
                color="#B90076"
            />
            <LabeledCheckbox
                label="Other"
                checked={filters.Other}
                onChange={handleCheckboxChange('Other')}
                color="#B90076"
            />

            <h3>Mode</h3>
            <LabeledCheckbox
                label="In Person"
                checked={filters.InPerson}
                onChange={handleCheckboxChange('InPerson')}
                color="#E60023"
            />
            <LabeledCheckbox
                label="Hybrid"
                checked={filters.Hybrid}
                onChange={handleCheckboxChange('Hybrid')}
                color="#E60023"
            />
        </div>
    );
};

export default MeetingsFilter;
