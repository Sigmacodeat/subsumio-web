import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { getSessionUser } from "@/lib/auth/server";
import { getStore, toPublic, type PublicUser } from "@/lib/auth/store";
import { UserTable } from "@/components/admin/user-table";

export const dynamic = "force-dynamic";

export const metadata = { title: "Kunden — Admin" };

export default async function AdminUsersPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login?next=/admin/users");
  if (me.role !== "admin") redirect("/dashboard");

  const allUsers = await getStore().list();
  const users = allUsers.map(toPublic) as PublicUser[];

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Users size={18} className="brand-text" />
          <h1 className="text-xl font-bold [color:var(--mk-text)]">Kunden</h1>
        </div>
        <p className="text-sm [color:var(--mk-text-muted)]">{users.length} registrierte Benutzer</p>
      </div>

      <UserTable users={users} />
    </div>
  );
}
