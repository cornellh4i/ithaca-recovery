import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "../../../services/auth";
import LoginCard from "../../components/navbar/LoginCard";
import AccessDeniedCard from "../../components/navbar/AccessDeniedCard";
import styles from "./page.module.scss";

interface LoginPageProps {
  searchParams: Promise<{ error?: string; email?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getAuth();

  if (session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN") {
    redirect("/");
  }

  const { error, email } = await searchParams;

  return (
    <div className={styles.page}>
      <Link href="/" className={styles.backLink}>
        ← Back to calendar
      </Link>
      <div className={styles.card}>
        {error === "AccessDenied" ? <AccessDeniedCard email={email ?? ""} /> : <LoginCard />}
      </div>
    </div>
  );
}
