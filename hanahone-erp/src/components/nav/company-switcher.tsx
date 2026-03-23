"use client";
import { useCompany } from "@/hooks/use-company";

export function CompanySwitcher() {
  const { selectedCompany, setSelectedCompany, companies } = useCompany();

  return (
    <div className="flex items-center gap-0.5 bg-[var(--bg)] border border-[var(--border)] rounded-full p-0.5">
      <button
        onClick={() => setSelectedCompany(null)}
        className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 ${
          selectedCompany === null
            ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
            : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
        }`}
      >
        Group
      </button>
      {companies.map((company) => (
        <button
          key={company.id}
          onClick={() => setSelectedCompany(company)}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 ${
            selectedCompany?.id === company.id
              ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          }`}
        >
          {company.name}
        </button>
      ))}
    </div>
  );
}
