import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "../../../services/auth";
import LoginCard from "../../components/atoms/LoginCard";
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
        <LoginCard />
      </div>
    </div>
  );
}
