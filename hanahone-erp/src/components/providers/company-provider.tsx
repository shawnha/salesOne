"use client";
import { createContext, useState, useCallback, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

type CompanyOption = { id: string; name: string } | null;

interface CompanyContextType {
  selectedCompany: CompanyOption;
  setSelectedCompany: (company: CompanyOption) => void;
  companies: { id: string; name: string }[];
}

export const CompanyContext = createContext<CompanyContextType>({
  selectedCompany: null,
  setSelectedCompany: () => {},
  companies: [],
});

export function CompanyProvider({
  children,
  companies,
}: {
  children: React.ReactNode;
  companies: { id: string; name: string }[];
}) {
  const [selectedCompany, setSelectedCompany] = useState<CompanyOption>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const companyId = searchParams.get("company");
    if (companyId) {
      const found = companies.find((c) => c.id === companyId);
      if (found) setSelectedCompany(found);
    }
  }, [searchParams, companies]);

  const handleSetCompany = useCallback((company: CompanyOption) => {
    setSelectedCompany(company);
    const params = new URLSearchParams(searchParams.toString());
    if (company) {
      params.set("company", company.id);
    } else {
      params.delete("company");
    }
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  return (
    <CompanyContext.Provider value={{ selectedCompany, setSelectedCompany: handleSetCompany, companies }}>
      {children}
    </CompanyContext.Provider>
  );
}
