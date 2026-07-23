import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "../../../services/auth";
import GoogleSignInButton from "../../components/atoms/GoogleSignInButton";
import IcrLogo from "../../assets/icr.png";
import styles from "./page.module.scss";

export default async function LoginPage() {
  const session = await getAuth();

  if (session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN") {
    redirect("/");
  }

  return (
    <div className={styles.page}>
      <Link href="/" className={styles.backLink}>
        ← Back to calendar
      </Link>
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
    </div>
  );
}
