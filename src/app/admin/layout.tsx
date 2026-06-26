import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getSessionUser();
  if (!me) redirect("/login?next=/admin");
  if (me.role !== "admin") redirect("/dashboard");

  return (
    <div data-tone="dark" className="min-h-screen [background:var(--mk-bg)]">
      <div className="mx-auto flex max-w-7xl gap-0">
        <aside className="sticky top-0 h-screen w-56 shrink-0 border-r [border-color:var(--mk-border)] [background:var(--mk-surface)]/50">
          <AdminSidebar />
        </aside>
        <main className="flex-1 overflow-x-hidden px-6 py-8 md:px-10 md:py-10">{children}</main>
      </div>
    </div>
  );
}
