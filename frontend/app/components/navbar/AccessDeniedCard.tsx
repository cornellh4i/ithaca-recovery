import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import SignInDifferentAccountButton from "./SignInDifferentAccountButton";
import styles from "../../../styles/components/navbar/AccessDeniedCard.module.scss";

interface AccessDeniedCardProps {
  email: string;
}

// Rendered by the /login route (page.tsx) in place of LoginCard when NextAuth's signIn
// callback (authConfig.ts) rejects a non-admin Google account -- that callback returns a
// redirect URL of the form /login?error=AccessDenied&email=<email> instead of the usual
// boolean, since NextAuth's own AccessDenied redirect otherwise carries no user info.
const AccessDeniedCard: React.FC<AccessDeniedCardProps> = ({ email }) => (
  <div className={styles.card}>
    <div className={styles.iconBadge}>
      <LockOutlinedIcon />
    </div>
    <h1 className={styles.heading}>Access denied</h1>
    <p className={styles.description}>
      This account is not authorized for this application. A Super Admin can grant access, or
      you can sign in with an account that already has it.
    </p>
    <SignInDifferentAccountButton />
    {email && (
      <>
        <div className={styles.divider} />
        <p className={styles.signedInAs}>
          Signed in as <span className={styles.email}>{email}</span>
        </p>
      </>
    )}
  </div>
);

export default AccessDeniedCard;
