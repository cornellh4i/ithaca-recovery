"use client";

import React from "react";
import { signIn, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Icon from "../ui/displays/Icon";
import styles from "./GoogleReconnectBanner.module.scss";

// App-wide banner for the one auth condition that doesn't announce itself anywhere else: the
// admin is still signed in, but their Google grant is gone, so every calendar write fails.
const GoogleReconnectBanner: React.FC = () => {
  const { data: session } = useSession();
  const pathname = usePathname();

  if (!session?.googleAuthExpired) return null;

  return (
    <div className={styles.banner} role="alert">
      <span className={styles.iconCircle}>
        <Icon name="warning-amber" size={16} />
      </span>
      <div className={styles.body}>
        <p className={styles.title}>Google Calendar isn&apos;t accepting changes from this account.</p>
        <p className={styles.text}>
          Your authorization expired or was revoked — meetings still save, but they stop
          publishing until you reconnect.
        </p>
      </div>
      <button
        type="button"
        className={styles.action}
        onClick={() => signIn("google", { callbackUrl: pathname })}
      >
        Reconnect Google
      </button>
    </div>
  );
};

export default GoogleReconnectBanner;
