"use client";

import { signIn } from "next-auth/react";
import styles from "../../../styles/components/navbar/SignInDifferentAccountButton.module.scss";

const SignInDifferentAccountButton: React.FC = () => (
    <button
        type="button"
        className={styles.button}
        onClick={() => signIn("google", { callbackUrl: "/" }, { prompt: "select_account" })}
    >
        Sign in with a different account
    </button>
);

export default SignInDifferentAccountButton;
