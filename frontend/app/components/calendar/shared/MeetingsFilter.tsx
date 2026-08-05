"use client";

import React from 'react';
import FilterGroup, { FilterGroupItem } from '../../shared/FilterGroup';
import { ROOM_COLORS, ZOOM_ROOM_COLOR, CATEGORY_COLOR } from '../../../../util/filterColors';
import { MeetingFilters } from '../../../../util/meetingFilters';

interface MeetingsFilterProps {
    filters: MeetingFilters;
    onFilterChange: (name: string, value: boolean) => void;
}

export const LOCATION_ITEMS: FilterGroupItem[] = [
    { key: 'SerenityRoom', label: 'Serenity Room', color: ROOM_COLORS['Serenity Room'] },
    { key: 'SeedsofHopeRoom', label: 'Seeds of Hope Room', color: ROOM_COLORS['Seeds of Hope Room'] },
    { key: 'UnityRoom', label: 'Unity Room', color: ROOM_COLORS['Unity Room'] },
    { key: 'RoomforImprovement', label: 'Room for Improvement', color: ROOM_COLORS['Room for Improvement'] },
    { key: 'RoomforAcceptance', label: 'Room for Acceptance', color: ROOM_COLORS['Room for Acceptance'] },
    { key: 'RoomforGratitude', label: 'Room for Gratitude', color: ROOM_COLORS['Room for Gratitude'] },
];

export const ZOOM_ITEMS: FilterGroupItem[] = [
    { key: 'SerenityRoomZoom', label: 'Serenity Room', color: ZOOM_ROOM_COLOR },
    { key: 'SeedsofHopeRoomZoom', label: 'Seeds of Hope Room', color: ZOOM_ROOM_COLOR },
    { key: 'UnityRoomZoom', label: 'Unity Room', color: ZOOM_ROOM_COLOR },
    { key: 'RoomforImprovementZoom', label: 'Room for Improvement', color: ZOOM_ROOM_COLOR },
    { key: "Children'sRoom@518Zoom", label: "Children's Room @ 518", color: ZOOM_ROOM_COLOR },
];

export const CALENDAR_ITEMS: FilterGroupItem[] = [
    { key: 'AA', label: 'AA', color: CATEGORY_COLOR },
    { key: 'AlAnon', label: 'Al-Anon', color: CATEGORY_COLOR },
    { key: 'Other', label: 'Other', color: CATEGORY_COLOR },
];

export const MODE_ITEMS: FilterGroupItem[] = [
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