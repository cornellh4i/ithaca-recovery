import React from "react";
import styles from "./Tooltip.module.scss";

interface TooltipProps {
    content: string;
    children: React.ReactNode;
    // "center" anchors under the middle of the trigger (default); "left" and "right" anchor to
    // that edge of the trigger instead, for triggers sitting near the matching edge of the
    // screen where a centered tooltip would run off-screen. Off-screen isn't only a legibility
    // problem: the tooltip stays in the layout while hidden, so an overhang gives the document
    // a horizontal scrollbar that scrolls nothing anyone wants.
    align?: "center" | "left" | "right";
    className?: string;
}

const ALIGN_CLASS = { center: "", left: styles.alignLeft, right: styles.alignRight };

const Tooltip: React.FC<TooltipProps> = ({ content, children, align = "center", className }) => {
    return (
        <span className={[styles.wrapper, className].filter(Boolean).join(" ")}>
            {children}
            <span className={[styles.tooltip, ALIGN_CLASS[align]].filter(Boolean).join(" ")}>
                {content}
            </span>
        </span>
    );
};

export default Tooltip;
