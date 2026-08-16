import { redirect } from "next/navigation";
import { DEFAULT_ADMIN_TAB } from "../../components/admin/adminTabs";

export default function AdminIndexPage() {
  redirect(`/admin/${DEFAULT_ADMIN_TAB}`);
}
