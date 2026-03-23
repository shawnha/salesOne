import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import Link from "next/link";

const reportTypes = [
  { key: "sales-by-period", label: "Sales by period", scope: "all" },
  { key: "top-products", label: "Top products", scope: "all" },
  { key: "order-fulfillment", label: "Order fulfillment", scope: "all" },
  { key: "inventory-levels", label: "Inventory levels", scope: "all" },
  { key: "customer-breakdown", label: "Customer breakdown", scope: "all" },
  { key: "production-efficiency", label: "Production efficiency", scope: "HOK" },
  { key: "consulting-revenue", label: "Consulting revenue", scope: "HOR" },
  { key: "brokerage-margins", label: "Brokerage margins", scope: "HOR" },
];

export default async function ReportsPage({ searchParams }: { searchParams: { company?: string } }) {
  const companyId = searchParams.company || null;

  let companyName: string | null = null;
  if (companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
    companyName = company?.name || null;
  }

  const visibleReports = reportTypes.filter((r) => {
    if (r.scope === "all") return true;
    if (!companyName) return true;
    return r.scope === companyName;
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tighter">Reports</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          {companyName ? `${companyName} reports` : "HanahOne Group — all reports"}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {visibleReports.map((report) => {
          const params = new URLSearchParams();
          if (companyId) params.set("company", companyId);
          params.set("type", report.key);
          params.set("format", "csv");

          return (
            <Card key={report.key}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold tracking-tight">{report.label}</h3>
                  {report.scope !== "all" && (
                    <span className="text-[11px] text-[var(--text-tertiary)]">{report.scope} only</span>
                  )}
                </div>
                <a
                  href={`/api/reports?${params.toString()}`}
                  className="px-4 py-1.5 text-xs font-semibold rounded-full bg-accent text-white hover:opacity-90 transition-all duration-200"
                  download
                >
                  Export CSV
                </a>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
