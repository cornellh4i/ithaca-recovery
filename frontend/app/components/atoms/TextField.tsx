import React, { useLayoutEffect, useRef, useState } from "react";
import styles from "../../../styles/components/atoms/TextField.module.scss";

interface TextFieldProps {
  input: string; // Placeholder or label text
  value?: string;
  onChange: (value: string) => void;
  underlineOnFocus?: boolean;
  label?: string | JSX.Element; // Label can now be either a string or an SVG element
  multiline?: boolean; // Renders a wrapping <textarea> instead of a single-line <input>
  [key: string]: any; // Allow for additional props
}

const TextField: React.FC<TextFieldProps> = ({
  input,
  value = "",
  onChange,
  label,
  multiline = false,
  ...props
}) => {
  const [underlineOnFocus, setUnderlineOnFocus] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const toggleFocus = () => setUnderlineOnFocus((prev) => !prev);

  // Determine font size based on label presence
  const fontSize = label == null ? "24px" : "18px";

  const inputClassName = `${styles.textfieldinput} ${multiline ? styles.multiline : ''} ${underlineOnFocus ? styles.focused : styles.default}`;

  // Auto-grows the textarea: tracks scrollHeight so it expands while typing instead of scrolling in a fixed box.
  useLayoutEffect(() => {
    if (!multiline || !textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, [multiline, value]);

  return (
    <div className={styles.textfieldcontainer}>
      {label && (
        <label
          className={styles.textfieldlabel}
          style={{ fontSize: "18px" }} // Label is always 18px
        >
          {typeof label === "string" ? <span>{label}</span> : label}
        </label>
      )}
      {multiline ? (
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onFocus={toggleFocus}
          onBlur={toggleFocus}
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
          onFocus={toggleFocus}
          onBlur={toggleFocus}
          onChange={(e) => onChange(e.target.value)}
          className={inputClassName}
          placeholder={input}
          style={{ fontSize }}
          {...props}
        />
      )}
    </div>
  );
};

export default TextField;
