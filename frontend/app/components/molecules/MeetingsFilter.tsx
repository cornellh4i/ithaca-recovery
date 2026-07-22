"use client";

import React from 'react';
import FilterGroup, { FilterGroupItem } from './FilterGroup';
import { ROOM_COLORS, ZOOM_ROOM_COLOR, CATEGORY_COLOR } from '../../../util/filterColors';

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

const LOCATION_ITEMS: FilterGroupItem[] = [
    { key: 'SerenityRoom', label: 'Serenity Room', color: ROOM_COLORS['Serenity Room'] },
    { key: 'SeedsofHopeRoom', label: 'Seeds of Hope Room', color: ROOM_COLORS['Seeds of Hope Room'] },
    { key: 'UnityRoom', label: 'Unity Room', color: ROOM_COLORS['Unity Room'] },
    { key: 'RoomforImprovement', label: 'Room for Improvement', color: ROOM_COLORS['Room for Improvement'] },
    { key: 'RoomforAcceptance', label: 'Room for Acceptance', color: ROOM_COLORS['Room for Acceptance'] },
    { key: 'RoomforGratitude', label: 'Room for Gratitude', color: ROOM_COLORS['Room for Gratitude'] },
];

const ZOOM_ITEMS: FilterGroupItem[] = [
    { key: 'SerenityRoomZoom', label: 'Serenity Room - Zoom', color: ZOOM_ROOM_COLOR },
    { key: 'SeedsofHopeRoomZoom', label: 'Seeds of Hope Room - Zoom', color: ZOOM_ROOM_COLOR },
    { key: 'UnityRoomZoom', label: 'Unity Room - Zoom', color: ZOOM_ROOM_COLOR },
    { key: 'RoomforImprovementZoom', label: 'Room for Improvement - Zoom', color: ZOOM_ROOM_COLOR },
    { key: "Children'sRoom@518Zoom", label: "Children's Room @ 518 - Zoom", color: ZOOM_ROOM_COLOR },
];

const CALENDAR_ITEMS: FilterGroupItem[] = [
    { key: 'AA', label: 'AA', color: CATEGORY_COLOR },
    { key: 'AlAnon', label: 'Al-Anon', color: CATEGORY_COLOR },
    { key: 'Other', label: 'Other', color: CATEGORY_COLOR },
];

const MODE_ITEMS: FilterGroupItem[] = [
    { key: 'InPerson', label: 'In Person', color: CATEGORY_COLOR },
    { key: 'Hybrid', label: 'Hybrid', color: CATEGORY_COLOR },
    { key: 'Remote', label: 'Remote', color: CATEGORY_COLOR },
];

const MeetingsFilter: React.FC<MeetingsFilterProps> = ({ filters, onFilterChange }) => {
    return (
        <div>
            <FilterGroup title="Location" items={LOCATION_ITEMS} checked={filters} onToggle={onFilterChange} headingVariant="title" />
            <FilterGroup title="Zoom Rooms" items={ZOOM_ITEMS} checked={filters} onToggle={onFilterChange} headingVariant="title" />
            <FilterGroup title="Calendar" items={CALENDAR_ITEMS} checked={filters} onToggle={onFilterChange} headingVariant="title" />
            <FilterGroup title="Mode" items={MODE_ITEMS} checked={filters} onToggle={onFilterChange} headingVariant="title" />
        </div>
    );
};

export default MeetingsFilter;