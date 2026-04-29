import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function SettingsPage() {
  const users = await prisma.user.findMany({
    include: { appRoles: { include: { company: true }, where: { app: "salesone" }, take: 1 } },
    orderBy: { name: "asc" },
  });

  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tighter">Settings</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">User management and system configuration</p>
      </div>

      <div className="space-y-6">
        <a href="/settings/integrations" className="block group">
          <Card>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center">
                  <span className="text-accent text-sm font-bold">&#x21C4;</span>
                </div>
                <div>
                  <h2 className="text-sm font-bold tracking-tight">Integrations</h2>
                  <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">Manage Shopify, Amazon, Naver, and other platform connections</p>
                </div>
              </div>
              <span className="text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] transition-colors text-sm">&rarr;</span>
            </div>
          </Card>
        </a>

        <Card>
          <h2 className="text-sm font-bold tracking-tight mb-4">Users ({users.length})</h2>
          <div className="space-y-0">
            <div className="grid grid-cols-5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] pb-3 border-b border-[var(--border)]">
              <span>Name</span>
              <span>Email</span>
              <span>Role</span>
              <span>Company</span>
              <span>Status</span>
            </div>
            {users.map((user) => (
              <div key={user.id} className="grid grid-cols-5 py-3 border-b border-[var(--border)] last:border-b-0 text-[13px] items-center">
                <span className="font-semibold">{user.name}</span>
                <span className="text-[var(--text-secondary)]">{user.email}</span>
                <span><Badge status={user.appRoles[0]?.role ?? "—"} /></span>
                <span className="text-[var(--text-secondary)]">{user.appRoles[0]?.company?.name ?? "—"}</span>
                <span><Badge status="Active" /></span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-bold tracking-tight mb-4">Add new user</h2>
          <form className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">Name</label>
              <input className="w-full px-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm focus:outline-none focus:border-accent" placeholder="Full name" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">Email</label>
              <input type="email" className="w-full px-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm focus:outline-none focus:border-accent" placeholder="email@company.com" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">Role</label>
              <select className="w-full px-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm focus:outline-none focus:border-accent">
                <option value="STAFF">Staff</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">Company</label>
              <select className="w-full px-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm focus:outline-none focus:border-accent">
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <button type="submit" className="px-6 py-2.5 text-sm font-semibold rounded-full bg-accent text-white hover:opacity-90 transition-all duration-200 active:scale-[0.98]">
                Create user
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
