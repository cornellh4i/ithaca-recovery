"use client";

import React from 'react'
import styles from "../../../styles/TestPage.module.scss";

interface TestButtonProps {
    testFunc: () => Promise<void>,
    text: string;
}

const TestButton: React.FC<TestButtonProps> = ({ testFunc, text }) => {

    const handleClick = async () => {
        await testFunc();
    }

  return (
    <button className={styles.btn} onClick={handleClick}>{text}</button>
  )
}

export default TestButton