import React, { useState } from "react";
import styles from "../../../../styles/components/atoms/TextField.module.scss";

interface TextFieldProps {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  underlineOnFocus?: boolean;
  [key: string]: any;
}

const TextField: React.FC<TextFieldProps> = ({
  label,
  value = "",
  onChange,
  ...props
}) => {
  const [underlineOnFocus, setUnderlineOnFocus] = useState(false);

  const toggleFocus = () => {
    setUnderlineOnFocus(!underlineOnFocus);
  };

  return (
    <div className={styles.textfieldcontainer}>
      <input
        type="text"
        value={value}
        onFocus={toggleFocus}
        onBlur={toggleFocus}
        onChange={(e) => onChange(e.target.value)}
        className={`${styles.textfieldinput} ${
          underlineOnFocus ? styles.focused : styles.default
        }`}
        placeholder={label}
      />
    </div>
  );
};

export default TextField;
