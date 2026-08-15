import React from "react";
import styles from "./Tooltip.module.scss";

interface TooltipProps {
    content: string;
    children: React.ReactNode;
    // "center" anchors under the middle of the trigger (default); "left" anchors to the
    // trigger's left edge instead, for triggers that sit near the left edge of the screen
    // where a centered tooltip would run off-screen.
    align?: "center" | "left";
    className?: string;
}

const Tooltip: React.FC<TooltipProps> = ({ content, children, align = "center", className }) => {
    return (
        <span className={[styles.wrapper, className].filter(Boolean).join(" ")}>
            {children}
            <span className={align === "left" ? [styles.tooltip, styles.alignLeft].join(" ") : styles.tooltip}>
                {content}
            </span>
        </span>
    );
};

export default Tooltip;
