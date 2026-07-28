"use client";

import React from "react";
import MuiIconButton from "@mui/material/IconButton";
import Tooltip from "./Tooltip";
import styles from "../../../styles/components/atoms/IconButton.module.scss";

interface IconButtonProps {
    icon: React.ReactNode;
    ariaLabel: string;
    onClick?: () => void;
    variant?: "filled" | "ghost" | "outlined";
    backgroundColor?: string;
    size?: "default" | "compact";
    tooltip?: string;
    tooltipAlign?: "center" | "left";
    className?: string;
}

const IconButton: React.FC<IconButtonProps> = ({
    icon,
    ariaLabel,
    onClick,
    variant = "ghost",
    backgroundColor,
    size = "default",
    tooltip,
    tooltipAlign = "center",
    className,
}) => {
    const sizeClass = size === "compact" ? styles.compact : styles.default;
    const variantClass =
        variant === "filled" ? styles.filled : variant === "outlined" ? styles.outlined : styles.ghost;

    // A mouse click leaves the button focused, keeping its focus ring showing after the
    // interaction is done. e.detail is 0 for a "click" synthesized by keyboard activation
    // (Enter/Space) and >0 for a real pointer click, so this only drops focus for the mouse
    // case -- tabbing to the button still shows a focus ring until the user tabs away.
    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
        if (e.detail > 0) {
            e.currentTarget.blur();
        }
        onClick?.();
    };

    const button = (
        <MuiIconButton
            className={[styles.iconButton, sizeClass, variantClass, className]
                .filter(Boolean)
                .join(" ")}
            onClick={handleClick}
            aria-label={ariaLabel}
            style={variant === "filled" && backgroundColor ? { backgroundColor } : undefined}
        >
            <span className={styles.iconWrap}>{icon}</span>
        </MuiIconButton>
    );

    if (!tooltip) {
        return button;
    }

    return (
        <Tooltip content={tooltip} align={tooltipAlign}>
            {button}
        </Tooltip>
    );
};

export default IconButton;
