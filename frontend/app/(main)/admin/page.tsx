import { redirect } from "next/navigation";
import { getAuth } from "../../../services/auth";
import AdminShell from "../../components/organisms/AdminShell";

export default async function AdminPage() {
  const session = await getAuth();

  if (session?.user?.role !== "ADMIN" && session?.user?.role !== "SUPER_ADMIN") {
    redirect("/");
  }

  return <AdminShell role={session.user.role} email={session.user.email ?? ""} />;
}
