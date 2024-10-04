"use client";

import React, { useState } from "react";
import styles from '/Users/sophie/Desktop/hack4impact/ithaca-recovery/frontend/styles/TextField.module.scss';

interface TextFieldProps {
    label: string;
    value?: string;
    onChange: (value: string) => void;
    underlineOnFocus?: boolean;
    [key: string]: any;
}

const TextField: React.FC<TextFieldProps> = ({
    label,
    value = '',
    onChange,
    underlineOnFocus = true,
    ...props
  }) => {
  
    return (
      <div>
        <div>
            <label className={styles.textfieldlabel}>{label}</label>
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${styles.textfieldinput} ${underlineOnFocus ? styles.focused : styles.default}`}
          placeholder="Email"
        />
      </div>
    );
  };
  
export default TextField;