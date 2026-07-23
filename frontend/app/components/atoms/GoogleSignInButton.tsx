"use client";

import React from "react";
import { signIn } from "next-auth/react";
import styles from "../../../styles/components/atoms/GoogleSignInButton.module.scss";

const GoogleSignInButton: React.FC = () => {
    return (
        <button
            type="button"
            className={styles.googleButton}
            onClick={() => signIn("google", { callbackUrl: "/" })}
        >
            <img src="/svg/google-icon.svg" alt="" className={styles.googleIcon} />
            <span>Continue with Google</span>
        </button>
    );
};

export default GoogleSignInButton;
