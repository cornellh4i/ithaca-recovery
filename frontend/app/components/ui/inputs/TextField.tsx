import React, { useLayoutEffect, useRef, useState } from "react";
import styles from "../../../../styles/components/ui/inputs/TextField.module.scss";

interface TextFieldProps {
  input: string; // Placeholder or label text
  value?: string;
  onChange: (value: string) => void;
  underlineOnFocus?: boolean;
  label?: string | React.JSX.Element; // Label can now be either a string or an SVG element
  multiline?: boolean; // Renders a wrapping <textarea> instead of a single-line <input>
  // Scales font-size to ~80% for narrow embedding contexts (the 280px Main Calendar
  // sidebar) -- set via inline style below, so a CSS override can't win over it.
  compact?: boolean;
  // Rendered below the field once the caller decides it's earned display (e.g. only after
  // the field has been focused and blurred) -- this component doesn't gate visibility
  // itself, it just renders whatever's passed.
  error?: string;
  // Composed with this component's own internal focus/blur handling (the underline
  // animation), not overwritten by it -- named explicitly here rather than left to flow
  // through a `...props` spread, since spread order would otherwise let a caller-supplied
  // onBlur silently replace toggleFocus instead of running alongside it.
  onFocus?: () => void;
  onBlur?: () => void;
  [key: string]: unknown; // Allow for additional props
}

const TextField: React.FC<TextFieldProps> = ({
  input,
  value = "",
  onChange,
  label,
  multiline = false,
  compact = false,
  error,
  onFocus,
  onBlur,
  ...props
}) => {
  const [underlineOnFocus, setUnderlineOnFocus] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleFocus = () => {
    setUnderlineOnFocus(true);
    onFocus?.();
  };
  const handleBlur = () => {
    setUnderlineOnFocus(false);
    onBlur?.();
  };

  // Determine font size based on label presence -- "" (passed for description fields
  // that intentionally render no label) must count as unlabeled, same as undefined/null.
  const hasLabel = Boolean(label);
  const fontSize = compact
    ? (hasLabel ? "14.4px" : "19.2px")
    : (hasLabel ? "18px" : "24px");
  const labelFontSize = compact ? "14.4px" : "18px";

  const inputClassName = `${styles.textfieldinput} ${multiline ? styles.multiline : ''} ${underlineOnFocus ? styles.focused : styles.default}`;

  // Auto-grows the textarea: tracks scrollHeight so it expands while typing instead of scrolling in a fixed box.
  useLayoutEffect(() => {
    if (!multiline || !textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, [multiline, value]);

  return (
    <div className={styles.textfieldwrapper}>
      <div className={`${styles.textfieldcontainer} ${error ? styles.textfieldContainerError : ''}`}>
        {label && (
          <label
            className={styles.textfieldlabel}
            style={{ fontSize: labelFontSize }}
          >
            {typeof label === "string" ? <span>{label}</span> : label}
          </label>
        )}
        {multiline ? (
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChange={(e) => onChange(e.target.value)}
            className={inputClassName}
            placeholder={input}
            style={{ fontSize }}
            {...props}
          />
        ) : (
          <input
            type="text"
            value={value}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChange={(e) => onChange(e.target.value)}
            className={inputClassName}
            placeholder={input}
            style={{ fontSize }}
            {...props}
          />
        )}
      </div>
      {error && <span className={styles.textfieldErrorText}>{error}</span>}
    </div>
  );
};

export default TextField;
