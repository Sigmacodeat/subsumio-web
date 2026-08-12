import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import { getStore, toPublic, type PublicUser } from "@/lib/auth/store";
import { UserTable } from "@/components/admin/user-table";
import { PageHeader } from "@/components/dashboard/page-header";

export const dynamic = "force-dynamic";

export const metadata = { title: "Kunden — Admin" };

export default async function AdminUsersPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login?next=/dashboard/admin/users");
  if (me.role !== "admin") redirect("/dashboard");

  const allUsers = await getStore().list();
  const users = allUsers.map(toPublic) as PublicUser[];

  return (
    <div className="mx-0 w-full space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader title="Kunden" breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Admin", href: "/dashboard/admin" }, { label: "Kunden" }]} />

      <UserTable users={users} />
    </div>
  );
}
