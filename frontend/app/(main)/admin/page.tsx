import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuth } from "../../../services/auth";
import AdminShell from "../../components/organisms/AdminShell";

export const metadata: Metadata = {
    title: "Admin | Ithaca Community Recovery",
};

export default async function AdminPage() {
  const session = await getAuth();

  if (!session) {
    redirect("/login");
  }

  if (session.user?.role !== "ADMIN" && session.user?.role !== "SUPER_ADMIN") {
    redirect("/");
  }

  return <AdminShell role={session.user.role} email={session.user.email ?? ""} />;
}
