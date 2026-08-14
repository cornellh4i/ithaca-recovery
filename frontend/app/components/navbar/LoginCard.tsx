import Image from "next/image";
import Link from "next/link";
import IcrLogo from "../../assets/icr.png";
import GoogleSignInButton from "../atoms/GoogleSignInButton";
import styles from "../../../styles/components/navbar/LoginCard.module.scss";

// The sign-in card content shared by the /login route (page.tsx, reached by direct
// navigation/desktop) and MobileLoginSheet (a full-screen slide-in overlay reached from the
// mobile navbar's signed-out profile button) -- kept as one component so the two surfaces
// can't drift out of sync.
const LoginCard: React.FC = () => (
  <div className={styles.card}>
    <Image src={IcrLogo} alt="Ithaca Community Recovery" className={styles.logo} width={72} height={72} />
    <h1 className={styles.heading}>Sign in to manage meetings</h1>
    <p className={styles.description}>
      Access is invite-only for Admins and Super Admins. We&apos;ll ask for calendar
      permission so meetings you create can publish to Google Calendar.
    </p>
    <GoogleSignInButton />
    <p className={styles.footer}>
      Not an admin? You don&apos;t need an account to view the{" "}
      <Link href="/" className={styles.footerLink}>
        Main Calendar
      </Link>{" "}
      or{" "}
      <Link href="/signage" className={styles.footerLink}>
        Signage
      </Link>{" "}
      pages.
    </p>
  </div>
);

export default LoginCard;
