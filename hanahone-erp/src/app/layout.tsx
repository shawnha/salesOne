import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/providers/session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { CompanyProvider } from "@/components/providers/company-provider";
import { TopNav } from "@/components/nav/top-nav";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import { getUnreadCount } from "@/lib/notifications";

export const metadata: Metadata = {
  title: "HanahOne ERP",
  description: "HanahOne Group ERP - Sales, Orders, Inventory",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const unreadNotifications = await getUnreadCount();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <SessionProvider>
          <ThemeProvider>
            <Suspense>
              <CompanyProvider companies={companies}>
                <TopNav unreadNotifications={unreadNotifications} />
                <main className="max-w-[1400px] mx-auto px-6 py-10">
                  {children}
                </main>
              </CompanyProvider>
            </Suspense>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
