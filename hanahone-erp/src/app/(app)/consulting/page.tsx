import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

const formatWon = (n: number) => `₩${n.toLocaleString()}`;

export default async function ConsultingPage({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  const where = searchParams.company ? { companyId: searchParams.company } : {};

  const engagements = await prisma.consultingEngagement.findMany({
    where,
    include: {
      customer: { select: { name: true } },
      company: { select: { name: true } },
    },
    orderBy: { startDate: "desc" },
  });

  const columns = [
    {
      key: "client",
      header: "Client",
      render: (row: (typeof engagements)[0]) => (
        <span className="font-semibold">{row.customer.name}</span>
      ),
    },
    {
      key: "title",
      header: "Title",
      render: (row: (typeof engagements)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.title}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row: (typeof engagements)[0]) => <Badge status={row.status} />,
    },
    {
      key: "billing",
      header: "Billing Amount",
      align: "right" as const,
      render: (row: (typeof engagements)[0]) => (
        <span className="font-semibold">{formatWon(Number(row.billingAmount))}</span>
      ),
    },
    {
      key: "startDate",
      header: "Start Date",
      render: (row: (typeof engagements)[0]) => (
        <span className="text-[var(--text-secondary)]">
          {new Date(row.startDate).toLocaleDateString("ko-KR")}
        </span>
      ),
    },
    {
      key: "endDate",
      header: "End Date",
      render: (row: (typeof engagements)[0]) => (
        <span className="text-[var(--text-secondary)]">
          {row.endDate ? new Date(row.endDate).toLocaleDateString("ko-KR") : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight">Consulting</h1>
      <Card>
        {engagements.length === 0 ? (
          <EmptyState title="No engagements" description="No consulting engagements found. Consulting is managed by HOR." />
        ) : (
          <DataTable columns={columns} data={engagements} />
        )}
      </Card>
    </div>
  );
}
