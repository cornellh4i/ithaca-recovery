import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import SignInDifferentAccountButton from "./SignInDifferentAccountButton";
import styles from "../../../styles/components/auth/AccessDeniedCard.module.scss";

// Rendered by the /login route (page.tsx) in place of LoginCard when NextAuth's signIn
// callback (authConfig.ts) rejects a non-admin Google account, redirecting to
// /login?error=AccessDenied. Deliberately doesn't display the rejected email -- that would mean
// putting it in the redirect URL, where it can persist in browser history, access logs, or a
// copied link.
const AccessDeniedCard: React.FC = () => (
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
  </div>
);

export default AccessDeniedCard;
