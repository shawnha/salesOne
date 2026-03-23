import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  const where: any = {};
  if (searchParams.company) {
    where.OR = [
      { fromCompanyId: searchParams.company },
      { toCompanyId: searchParams.company },
    ];
  }

  const transfers = await prisma.interCompanyTransfer.findMany({
    where,
    include: {
      fromCompany: { select: { name: true } },
      toCompany: { select: { name: true } },
      order: { select: { orderNumber: true, totalAmount: true } },
    },
    orderBy: { transferDate: "desc" },
  });

  const formatWon = (n: number) => `₩${n.toLocaleString()}`;

  const columns = [
    {
      key: "order",
      header: "Order #",
      render: (row: (typeof transfers)[0]) => (
        <Link href={`/transfers/${row.id}`} className="font-semibold text-accent hover:underline">
          {row.order.orderNumber}
        </Link>
      ),
    },
    {
      key: "from",
      header: "From",
      render: (row: (typeof transfers)[0]) => (
        <span className="font-semibold">{row.fromCompany.name}</span>
      ),
    },
    {
      key: "to",
      header: "To",
      render: (row: (typeof transfers)[0]) => (
        <span className="font-semibold">{row.toCompany.name}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row: (typeof transfers)[0]) => <Badge status={row.status} />,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right" as const,
      render: (row: (typeof transfers)[0]) => (
        <span className="font-semibold">{formatWon(Number(row.order.totalAmount))}</span>
      ),
    },
    {
      key: "date",
      header: "Date",
      render: (row: (typeof transfers)[0]) => (
        <span className="text-[var(--text-secondary)]">
          {new Date(row.transferDate).toLocaleDateString("ko-KR")}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight">Inter-Company Transfers</h1>
      <Card>
        {transfers.length === 0 ? (
          <EmptyState title="No transfers" description="No inter-company transfers found." />
        ) : (
          <DataTable columns={columns} data={transfers} />
        )}
      </Card>
    </div>
  );
}
