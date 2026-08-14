import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "../../../services/auth";
import LoginCard from "../../components/navbar/LoginCard";
import AccessDeniedCard from "../../components/navbar/AccessDeniedCard";
import styles from "./page.module.scss";

interface LoginPageProps {
  // Next resolves a repeated query key (e.g. ?email=a&email=b) to string[], not string, despite
  // most call sites only ever needing the single-value case -- normalized below.
  searchParams: Promise<{ error?: string | string[]; email?: string | string[] }>;
}

const firstOf = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error: rawError, email: rawEmail } = await searchParams;
  const error = firstOf(rawError);
  const email = firstOf(rawEmail);
  const accessDenied = error === "AccessDenied";

  // Skipped entirely when accessDenied -- a stale Admin session cookie (e.g. this device was
  // already signed in when SignInDifferentAccountButton was used to try a second, rejected
  // account) must not silently swallow that rejection by bouncing back to "/" before
  // AccessDeniedCard ever gets a chance to render.
  if (!accessDenied) {
    const session = await getAuth();
    if (session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN") {
      redirect("/");
    }
  }

  return (
    <div className={styles.page}>
      <Link href="/" className={styles.backLink}>
        ← Back to calendar
      </Link>
      <div className={styles.card}>
        {accessDenied ? <AccessDeniedCard email={email ?? ""} /> : <LoginCard />}
      </div>
    </div>
  );
}
