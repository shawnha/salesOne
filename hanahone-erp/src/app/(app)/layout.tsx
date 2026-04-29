import { CompanyProvider } from "@/components/providers/company-provider";
import { TopNav } from "@/components/nav/top-nav";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import { getUnreadCount } from "@/lib/notifications";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const unreadNotifications = await getUnreadCount();

  return (
    <Suspense>
      <CompanyProvider companies={companies}>
        <TopNav unreadNotifications={unreadNotifications} />
        <main className="max-w-[1400px] mx-auto px-6 py-10">{children}</main>
      </CompanyProvider>
    </Suspense>
  );
}
