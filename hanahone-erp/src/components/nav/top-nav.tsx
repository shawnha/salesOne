"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CompanySwitcher } from "./company-switcher";
import { useTheme } from "@/components/providers/theme-provider";
import { useCompany } from "@/hooks/use-company";

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/sales", label: "Sales" },
  { href: "/orders", label: "Orders" },
  { href: "/inventory", label: "Inventory" },
  { href: "/reconciliation", label: "Recon" },
  { href: "/shipping", label: "Shipping" },
  { href: "/products", label: "Products" },
  { href: "/customers", label: "Customers" },
  { href: "/transfers", label: "Transfers" },
  { href: "/manufacturing", label: "Mfg" },
  { href: "/consulting", label: "Consulting" },
  { href: "/reports", label: "Reports" },
];

export function TopNav() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { selectedCompany } = useCompany();
  const companyParam = selectedCompany ? `?company=${selectedCompany.id}` : "";

  return (
    <nav className="sticky top-4 z-40 max-w-[1400px] mx-auto px-6">
      <div className="flex items-center justify-between gap-3">
        {/* Main nav pill — logo + menu links */}
        <div className="bg-[var(--surface)]/80 backdrop-blur-xl border border-[var(--border)] rounded-full px-6 py-2.5 flex items-center gap-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.06)] min-w-0 overflow-hidden">
          <Link href={`/dashboard${companyParam}`} className="font-bold text-[15px] tracking-tight whitespace-nowrap flex-shrink-0">
            Hanah<span className="text-accent">One</span>
          </Link>
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={`${link.href}${companyParam}`}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-full transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                  pathname === link.href || pathname?.startsWith(link.href + "/")
                    ? "text-accent bg-[var(--accent-dim)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Right side — company switcher, theme toggle, settings (outside pill) */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <CompanySwitcher />
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-all duration-200 text-sm"
            aria-label="Toggle theme"
          >
            {theme === "light" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#6366f1" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
          </button>
          <Link
            href="/settings"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
              pathname?.startsWith("/settings")
                ? "text-accent"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
            }`}
            aria-label="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
        </div>
      </div>
    </nav>
  );
}
