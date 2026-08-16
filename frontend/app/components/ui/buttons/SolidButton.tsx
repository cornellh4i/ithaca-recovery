"use client";

import React from "react";
import styles from "./SolidButton.module.scss";

interface SolidButtonProps {
    label: string;
    onClick?: () => void;
    variant?: "primary" | "danger";
    loading?: boolean;
    disabled?: boolean;
    type?: "button" | "submit";
    className?: string;
}

const SolidButton: React.FC<SolidButtonProps> = ({
    label,
    onClick,
    variant = "primary",
    loading = false,
    disabled = false,
    type = "button",
    className,
}) => {
    const variantClass = variant === "danger" ? styles.danger : styles.primary;

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

    return (
        <button
            type={type}
            className={[styles.solidButton, variantClass, className]
                .filter(Boolean)
                .join(" ")}
            onClick={handleClick}
            disabled={disabled || loading}
            aria-busy={loading}
        >
            {loading && <span className={styles.spinner} aria-hidden="true" />}
            <span className={styles.label}>{label}</span>
        </button>
    );
};

export default SolidButton;
