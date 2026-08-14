"use client";

import React from "react";
import { signIn } from "next-auth/react";
import Icon from "../ui/displays/Icon";
import styles from "../../../styles/components/auth/GoogleSignInButton.module.scss";

const GoogleSignInButton: React.FC = () => {
    return (
        <button
            type="button"
            className={styles.googleButton}
            onClick={() => signIn("google", { callbackUrl: "/" })}
        >
            <Icon name="google" className={styles.googleIcon} />
            <span>Continue with Google</span>
        </button>
    );
};

export default GoogleSignInButton;
