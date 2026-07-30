import React from "react";
import styles from "../../../styles/components/calendar/SignInPrompt.module.scss";

const SignInPrompt: React.FC = () => {
    return (
        <div className={styles.container}>
            <img src="/svg/lock-icon.svg" alt="" className={styles.icon} />
            <h2 className={styles.heading}>Sign in as Admin to manage meetings and application</h2>
            <p className={styles.description}>
                Sign in with an authorized Admin account to add, edit, or delete meetings, and to manage rooms, users, and settings.
            </p>
            <p className={styles.hint}>
                Use <strong>Sign In</strong> at the top right to get started.
            </p>
        </div>
    );
};

export default SignInPrompt;
