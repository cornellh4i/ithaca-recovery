import React from "react";
import styles from './RadioGroup.module.scss';

interface RadioGroupProps {
    label: string;
    options: string[];
    selectedOption: string;
    onChange: (option: string) => void;
    name: string;
    disabledOptions?: string[];
    // Extra content rendered beside a specific option's row (only while that option is
    // selected) -- e.g. a date picker next to "On". Rendered as a sibling of the option's
    // <label>, not a child, so clicking into it doesn't also toggle the radio via native
    // label-to-control click forwarding.
    optionContent?: Partial<Record<string, React.ReactNode>>;
    // Meeting-form scale: caption-style group label and smaller options, matching the other
    // form atoms' compact variants. The admin modals keep the full-size default.
    compact?: boolean;
    [key: string]: unknown;
}

const RadioGroup: React.FC<RadioGroupProps> = ({
    label,
    options,
    selectedOption,
    onChange,
    name,
    disabledOptions = [],
    optionContent = {},
    compact = false,
    ...props
}) => {
    return (
        <div className={`${styles.radioGroupContainer} ${compact ? styles.compact : ''}`.trim()} {...props}>
            <label className={styles.radioGroupLabel}>{label}</label>
            <div className={styles.radioGroupOptions}>
                {options.map((option) => {
                    const isDisabled = disabledOptions.includes(option);
                    const isSelected = selectedOption === option;

                    return (
                        <div key={option} className={styles.radioOptionRow}>
                            <label className={`${styles.radioOption} ${isDisabled ? styles.disabled : ''}`}>
                                <input
                                    type="radio"
                                    name={name}
                                    value={option}
                                    checked={isSelected}
                                    onChange={() => onChange(option)}
                                    disabled={isDisabled} // Disable if the option is in the disabledOptions array
                                    className={styles.radioInput}
                                />
                                <span className={styles.radioCustomIcon}>
                                    {/* Conditionally render the appropriate SVG */}
                                    {isSelected && !isDisabled ? (
                                        // SVG when selected and not disabled
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="21" viewBox="0 0 20 21" fill="none">
                                            <circle cx="10" cy="10.5" r="9.375" stroke="#CC3366" strokeWidth="1.25" />
                                            <path d="M15.625 10.5C15.625 13.3004 13.138 15.625 10 15.625C6.86202 15.625 4.375 13.3004 4.375 10.5C4.375 7.69959 6.86202 5.375 10 5.375C13.138 5.375 15.625 7.69959 15.625 10.5Z" fill="#CC3366" stroke="#CC3366" strokeWidth="0.75" />
                                        </svg>
                                    ) : isSelected && isDisabled ? (
                                        // SVG when selected but disabled -- still needs a filled dot (just muted grey,
                                        // not pink), otherwise a locked selection is indistinguishable on screen from
                                        // every other disabled-and-unselected option.
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="21" viewBox="0 0 20 21" fill="none">
                                            <circle cx="10" cy="10.5" r="9.375" stroke="#B0B0B0" strokeWidth="1.25" />
                                            <path d="M15.625 10.5C15.625 13.3004 13.138 15.625 10 15.625C6.86202 15.625 4.375 13.3004 4.375 10.5C4.375 7.69959 6.86202 5.375 10 5.375C13.138 5.375 15.625 7.69959 15.625 10.5Z" fill="#B0B0B0" stroke="#B0B0B0" strokeWidth="0.75" />
                                        </svg>
                                    ) : isDisabled ? (
                                        // SVG when disabled (gray outline, no fill)
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="21" viewBox="0 0 20 21" fill="none">
                                            <circle cx="10" cy="10.5" r="9.375" stroke="#B0B0B0" strokeWidth="1.25" />
                                        </svg>
                                    ) : (
                                        // SVG when not selected and not disabled
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="21" viewBox="0 0 20 21" fill="none">
                                            <circle cx="10" cy="10.5" r="9.375" stroke="#1E1E1E" strokeWidth="1.25" />
                                        </svg>
                                    )}
                                </span>
                                <span className={styles.radioLabel}>{option}</span>
                            </label>
                            {optionContent[option] && isSelected && !isDisabled && (
                                <div className={styles.radioInlineContent}>{optionContent[option]}</div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default RadioGroup;