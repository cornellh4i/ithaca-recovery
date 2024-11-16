import React, { useState } from "react";
import styles from "../../../../styles/components/atoms/TextField.module.scss";

interface TextFieldProps {
  input: string; // Placeholder or label text
  value?: string;
  onChange: (value: string) => void;
  underlineOnFocus?: boolean;
  label?: string | JSX.Element; // Label can now be either a string or an SVG element
  [key: string]: any; // Allow for additional props
}

const TextField: React.FC<TextFieldProps> = ({
  input,
  value = "",
  onChange,
  label,
  ...props
}) => {
  const [underlineOnFocus, setUnderlineOnFocus] = useState(false);

  const toggleFocus = () => setUnderlineOnFocus((prev) => !prev);

  // Determine font size based on label presence
  const fontSize = label == null ? "24px" : "18px";

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
      <input
        type="text"
        value={value}
        onFocus={toggleFocus}
        onBlur={toggleFocus}
        onChange={(e) => onChange(e.target.value)}
        className={`${styles.textfieldinput} ${underlineOnFocus ? styles.focused : styles.default}`}
        placeholder={input}
        style={{ fontSize }} // Apply font size based on the presence of the label
        {...props} // Include props safely after handling focus
      />
    </div>
  );
};

export default TextField;
