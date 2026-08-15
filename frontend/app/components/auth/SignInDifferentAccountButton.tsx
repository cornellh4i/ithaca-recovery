"use client";

import { signIn } from "next-auth/react";
import styles from "./SignInDifferentAccountButton.module.scss";

const SignInDifferentAccountButton: React.FC = () => (
    <button
        type="button"
        className={styles.button}
        // next-auth forwards this object as-is to Google's /authorize request, replacing (not
        // merging with) authConfig.ts's own `prompt: "consent"` -- omitting "consent" here would
        // let Google skip re-consent for an already-authorized admin and omit refresh_token,
        // silently breaking that session's hourly token refresh later on.
        onClick={() => signIn("google", { callbackUrl: "/" }, { prompt: "select_account consent" })}
    >
        Sign in with a different account
    </button>
);

export default SignInDifferentAccountButton;
