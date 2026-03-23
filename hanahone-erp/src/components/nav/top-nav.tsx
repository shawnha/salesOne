"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CompanySwitcher } from "./company-switcher";
import { useTheme } from "@/components/providers/theme-provider";

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/sales", label: "Sales" },
  { href: "/orders", label: "Orders" },
  { href: "/inventory", label: "Inventory" },
  { href: "/products", label: "Products" },
  { href: "/customers", label: "Customers" },
  { href: "/transfers", label: "Transfers" },
  { href: "/manufacturing", label: "Manufacturing" },
  { href: "/consulting", label: "Consulting" },
  { href: "/reports", label: "Reports" },
];

export function TopNav() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="sticky top-4 z-40 max-w-[1400px] mx-auto px-6">
      <div className="bg-[var(--surface)]/80 backdrop-blur-xl border border-[var(--border)] rounded-full px-6 py-2.5 flex items-center justify-between shadow-[0_4px_20px_-2px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="font-bold text-[15px] tracking-tight">
            Hanah<span className="text-accent">One</span>
          </Link>
          <div className="flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 text-[13px] font-medium rounded-full transition-all duration-200 ${
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
        <div className="flex items-center gap-3">
          <CompanySwitcher />
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-all duration-200 text-sm"
            aria-label="Toggle theme"
          >
            {theme === "light" ? "D" : "L"}
          </button>
        </div>
      </div>
    </nav>
  );
}
