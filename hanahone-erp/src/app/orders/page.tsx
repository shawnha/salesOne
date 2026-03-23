import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";

const formatWon = (n: number) => `₩${n.toLocaleString()}`;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { company?: string; type?: string };
}) {
  const where: any = {};
  if (searchParams.company) where.companyId = searchParams.company;
  if (searchParams.type) where.type = searchParams.type;

  const orders = await prisma.order.findMany({
    where,
    include: {
      customer: { select: { name: true } },
      company: { select: { name: true } },
      transfer: true,
    },
    orderBy: { orderDate: "desc" },
    take: 100,
  });

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
        <span className="text-[var(--text-secondary)]">
          {row.customer?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (row: (typeof orders)[0]) => <Badge status={row.type} />,
    },
    {
      key: "status",
      header: "Status",
      render: (row: (typeof orders)[0]) => <Badge status={row.status} />,
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
      <h1 className="text-xl font-bold tracking-tight">Orders</h1>
      <Card>
        {orders.length === 0 ? (
          <EmptyState title="No orders" description="No orders found for the selected filters." />
        ) : (
          <DataTable columns={columns} data={orders} />
        )}
      </Card>
    </div>
  );
}
