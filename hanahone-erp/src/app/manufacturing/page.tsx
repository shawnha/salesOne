import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";

export default async function ManufacturingPage({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  const where = searchParams.company ? { companyId: searchParams.company } : {};

  const productionOrders = await prisma.productionOrder.findMany({
    where,
    include: {
      product: { select: { name: true, sku: true } },
      company: { select: { name: true } },
    },
    orderBy: { startDate: "desc" },
  });

  const columns = [
    {
      key: "product",
      header: "Product",
      render: (row: (typeof productionOrders)[0]) => (
        <Link href={`/manufacturing/${row.id}`} className="font-semibold text-accent hover:underline">
          {row.product.name}
        </Link>
      ),
    },
    {
      key: "sku",
      header: "SKU",
      render: (row: (typeof productionOrders)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.product.sku}</span>
      ),
    },
    {
      key: "planned",
      header: "Planned",
      align: "right" as const,
      render: (row: (typeof productionOrders)[0]) => (
        <span className="font-semibold">{row.quantityToProduce}</span>
      ),
    },
    {
      key: "produced",
      header: "Produced",
      align: "right" as const,
      render: (row: (typeof productionOrders)[0]) => (
        <span className="font-semibold">{row.quantityProduced}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row: (typeof productionOrders)[0]) => <Badge status={row.status} />,
    },
    {
      key: "startDate",
      header: "Start Date",
      render: (row: (typeof productionOrders)[0]) => (
        <span className="text-[var(--text-secondary)]">
          {new Date(row.startDate).toLocaleDateString("ko-KR")}
        </span>
      ),
    },
    {
      key: "endDate",
      header: "End Date",
      render: (row: (typeof productionOrders)[0]) => (
        <span className="text-[var(--text-secondary)]">
          {row.endDate ? new Date(row.endDate).toLocaleDateString("ko-KR") : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight">Manufacturing</h1>
      <Card>
        {productionOrders.length === 0 ? (
          <EmptyState title="No production orders" description="No production orders found. Manufacturing is managed by HOK." />
        ) : (
          <DataTable columns={columns} data={productionOrders} />
        )}
      </Card>
    </div>
  );
}
