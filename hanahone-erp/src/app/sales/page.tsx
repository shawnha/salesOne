import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";

const formatWon = (n: number) => `₩${n.toLocaleString()}`;

export default async function SalesPage({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  const where: any = { type: "SALE" as const };
  if (searchParams.company) where.companyId = searchParams.company;

  const orders = await prisma.order.findMany({
    where,
    include: {
      customer: { select: { name: true } },
      company: { select: { name: true } },
    },
    orderBy: { orderDate: "desc" },
    take: 100,
  });

  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);

  const columns = [
    {
      key: "orderNumber",
      header: "Order #",
      render: (row: (typeof orders)[0]) => (
        <Link href={`/orders/${row.id}`} className="font-semibold text-accent hover:underline">
          {row.orderNumber}
        </Link>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (row: (typeof orders)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.customer?.name ?? "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row: (typeof orders)[0]) => <Badge status={row.status} />,
    },
    {
      key: "company",
      header: "Company",
      render: (row: (typeof orders)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.company.name}</span>
      ),
    },
    {
      key: "totalAmount",
      header: "Amount",
      align: "right" as const,
      render: (row: (typeof orders)[0]) => (
        <span className="font-semibold">{formatWon(Number(row.totalAmount))}</span>
      ),
    },
    {
      key: "orderDate",
      header: "Date",
      render: (row: (typeof orders)[0]) => (
        <span className="text-[var(--text-secondary)]">
          {new Date(row.orderDate).toLocaleDateString("ko-KR")}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Sales</h1>
        <div className="text-right">
          <p className="text-xs text-[var(--text-secondary)]">Total Revenue</p>
          <p className="text-lg font-semibold">{formatWon(totalRevenue)}</p>
        </div>
      </div>
      <Card>
        {orders.length === 0 ? (
          <EmptyState title="No sales" description="No sales orders found for the selected company." />
        ) : (
          <DataTable columns={columns} data={orders} />
        )}
      </Card>
    </div>
  );
}
