"use client";

import React, { useState } from "react";
import styles from '/Users/sophie/Desktop/hack4impact/ithaca-recovery/frontend/styles/RadioGroup.module.scss';

interface RadioGroupProps {
    label: string;
    options: string[];
    selectedOption: string;
    onChange: (option: string) => void;
    name: string;
    disabledOptions?: string[];
    [key: string]: any;
}

const RadioGroup: React.FC<RadioGroupProps> = ({
    label,
    options,
    selectedOption,
    onChange,
    name,
    disabledOptions = [],
    ...props
}) => {
    return (
        <div className={styles.radioGroupContainer} {...props}>
            <label className={styles.radioGroupLabel}>{label}</label>
            <div className={styles.radioGroupOptions}>
                {options.map((option) => (
                    <label key={option} className={styles.radioOption}>
                        <input
                            type="radio"
                            name={name}
                            value={option}
                            checked={selectedOption === option}
                            onChange={() => onChange(option)}
                            disabled={disabledOptions.includes(option)} // Disable if the option is in the disabledOptions array
                        />
                        {option}
                    </label>
                ))}
            </div>
        </div>
    );
};

export default RadioGroup;