import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuth } from "../../../../services/auth";
import AdminShell from "../../../components/admin/AdminShell";
import { DEFAULT_ADMIN_TAB, isAdminTabKey } from "../../../components/admin/adminTabs";

export const metadata: Metadata = {
    title: "Admin | Ithaca Community Recovery",
};

export default async function AdminTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const session = await getAuth();

  if (!session) {
    redirect("/login");
  }

  if (session.user?.role !== "ADMIN" && session.user?.role !== "SUPER_ADMIN") {
    redirect("/");
  }

  const { tab } = await params;
  if (!isAdminTabKey(tab)) {
    redirect(`/admin/${DEFAULT_ADMIN_TAB}`);
  }

  return <AdminShell role={session.user.role} email={session.user.email ?? ""} activeTab={tab} />;
}
