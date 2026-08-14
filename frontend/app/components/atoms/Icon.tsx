"use client";

import React from "react";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import CheckIcon from "@mui/icons-material/Check";
import WarningIcon from "@mui/icons-material/Warning";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DescriptionIcon from "@mui/icons-material/Description";
import LockIcon from "@mui/icons-material/Lock";
import RepeatIcon from "@mui/icons-material/Repeat";
import ViewTimelineIcon from "@mui/icons-material/ViewTimeline";
import CalendarViewWeekIcon from "@mui/icons-material/CalendarViewWeek";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import MailIcon from "@mui/icons-material/Mail";
import PersonIcon from "@mui/icons-material/Person";
import GroupIcon from "@mui/icons-material/Group";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import VideoCallIcon from "@mui/icons-material/VideoCall";
import CoPresentIcon from "@mui/icons-material/CoPresent";
import AddIcon from "@mui/icons-material/Add";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import SyncProblemIcon from "@mui/icons-material/SyncProblem";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import MenuIcon from "@mui/icons-material/Menu";
import FilterListIcon from "@mui/icons-material/FilterList";
import TodayIcon from "@mui/icons-material/Today";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import type { SvgIconComponent } from "@mui/icons-material";

// Brand logos with no faithful @mui/icons-material equivalent (multi-color marks with no
// generic-icon substitute) -- these stay as local /public/svg assets, rendered as plain <img>.
const LOCAL_ICONS = {
    google: "/svg/google-icon.svg",
    zoom: "/svg/zoom-icon.svg",
} as const;

// Every icon here renders at currentColor -- this file never sets a color itself. Callers get
// the right color entirely from CSS (e.g. IconButton's .iconWrap sets $medium-grey-color;
// ViewMeeting's .syncFailureHeader sets $danger-color and its icon inherits it automatically).
// That's deliberate: it's what makes a future dark-mode pass a CSS-only change instead of an
// icon-by-icon JS hunt, and it's already the pattern this codebase uses wherever an icon sits
// next to color-matched text (see .conflictBlock/.suspensionBlock, .zoomSyncedBadge).
// `satisfies`, not a `Record<string, SvgIconComponent>` type annotation -- an explicit
// annotation would widen `keyof typeof MUI_ICONS` to plain `string`, silently collapsing
// IconName below to `string` and defeating every bit of typo protection the name-based API
// is supposed to provide. `satisfies` still validates every value is an SvgIconComponent
// without erasing the literal key union.
const MUI_ICONS = {
    close: CloseIcon,
    delete: DeleteIcon,
    "chevron-right": ChevronRightIcon,
    "chevron-left": ChevronLeftIcon,
    check: CheckIcon,
    warning: WarningIcon,
    "back-arrow": ArrowBackIcon,
    description: DescriptionIcon,
    lock: LockIcon,
    repeat: RepeatIcon,
    "view-timeline": ViewTimelineIcon,
    "calendar-view-week": CalendarViewWeekIcon,
    clock: AccessTimeIcon,
    mail: MailIcon,
    person: PersonIcon,
    group: GroupIcon,
    location: LocationOnIcon,
    "video-call": VideoCallIcon,
    "co-present": CoPresentIcon,
    plus: AddIcon,
    // Decoded from the deleted SVGs: both are Material Symbols "info" (outlined ring, dot
    // above a lower vertical bar -- an "i" letterform), not an exclamation/error mark (which
    // is the reverse order, bar above dot). Only the container's ambient color (danger vs.
    // warning red/amber) differs, so both point at the one MUI icon.
    "danger-circle": InfoOutlinedIcon,
    "warning-circle": InfoOutlinedIcon,
    // NOT the same glyph as danger-circle -- the original sync-error-icon.svg is two curved
    // arrows forming a broken sync ring around an exclamation mark (see docs/01-user-guide/
    // reference/icon-and-badge-legend.md's "Sync failure" section), not a plain error circle.
    "sync-error": SyncProblemIcon,
    pause: PauseIcon,
    resume: PlayArrowIcon,
    menu: MenuIcon,
    filter: FilterListIcon,
    calendar: TodayIcon,
    "drop-down-arrow": ArrowDropDownIcon,
} satisfies Record<string, SvgIconComponent>;

export type IconName = keyof typeof LOCAL_ICONS | keyof typeof MUI_ICONS;

// For tests -- lets a table-driven test assert every registered name actually renders,
// without hand-maintaining a duplicate list that silently goes stale as names are added.
export const ALL_ICON_NAMES: IconName[] = [
    ...(Object.keys(LOCAL_ICONS) as (keyof typeof LOCAL_ICONS)[]),
    ...(Object.keys(MUI_ICONS) as (keyof typeof MUI_ICONS)[]),
];

const SIZE_PX: Record<"sm" | "md" | "lg", number> = {
    sm: 16,
    md: 24,
    lg: 32,
};

interface IconProps {
    name: IconName;
    size?: "sm" | "md" | "lg" | number;
    className?: string;
    ariaLabel?: string;
}

const Icon: React.FC<IconProps> = ({ name, size, className, ariaLabel }) => {
    // No explicit size -> icon fills its container (e.g. IconButton's .iconWrap), matching the
    // pre-refactor <img> behavior instead of forcing a fixed intrinsic size everywhere.
    const px = size === undefined ? undefined : typeof size === "number" ? size : SIZE_PX[size];
    const dimensions = px !== undefined ? { width: px, height: px } : undefined;
    const decorative = !ariaLabel;

    const MuiComponent = MUI_ICONS[name as keyof typeof MUI_ICONS];
    if (MuiComponent) {
        return (
            <MuiComponent
                data-icon-name={name}
                className={className}
                style={dimensions}
                aria-hidden={decorative || undefined}
                aria-label={ariaLabel}
                role={ariaLabel ? "img" : undefined}
            />
        );
    }

    const src = LOCAL_ICONS[name as keyof typeof LOCAL_ICONS];
    if (process.env.NODE_ENV !== "production" && src === undefined) {
        // IconName's typo protection only covers literal call sites -- a name built from a
        // variable (e.g. MODE_ICON_NAME[tag]) can still resolve to something unregistered at
        // runtime. Falls through to a blank <img> either way; this just makes that visible.
        console.warn(`Icon: no registered icon named "${name}"`);
    }
    return (
        <img
            data-icon-name={name}
            src={src}
            alt={ariaLabel ?? ""}
            aria-hidden={decorative || undefined}
            className={className}
            style={dimensions}
        />
    );
};

export default Icon;
