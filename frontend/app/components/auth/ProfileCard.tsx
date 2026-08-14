import React from "react";
import type { Session } from "next-auth";
import { signOut } from "next-auth/react";
import styles from "../../../styles/components/navigation/AppNavigation.module.scss";

interface ProfileCardProps {
  session: Session;
  // Rendered by the caller rather than recomputed here -- AppNavigation already resolves the
  // real-avatar-vs-initial-fallback choice once (its imageError pre-verification effect) and
  // uses it in two places; recomputing it inside this component would be a second, divergent
  // copy of that state.
  userAvatar: React.ReactNode;
  onSignOut?: () => void;
}

const ProfileCard: React.FC<ProfileCardProps> = ({ session, userAvatar, onSignOut }) => {
  return (
    <React.Fragment>
      <div className={styles.flyoutHeader}>
        {userAvatar}
        <div className={styles.flyoutInfo}>
          <span className={styles.welcome}>Hi, {session.user.name}</span>
          <span className={styles.flyoutEmail}>{session.user.email}</span>
          <span className={styles.flyoutRole}>
            {session.user.role === "SUPER_ADMIN"
              ? "Super Admin"
              : session.user.role === "ADMIN"
              ? "Admin"
              : "User"}
          </span>
        </div>
      </div>
      <hr className={styles.flyoutSeparator} />
      <button
        type="button"
        className={styles.signOutButton}
        onClick={() => (onSignOut ? onSignOut() : signOut({ callbackUrl: "/" }))}
      >
        <span>Sign Out</span>
      </button>
    </React.Fragment>
  );
};

export default ProfileCard;
