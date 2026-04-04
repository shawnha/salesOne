import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TransfersTable } from "@/components/transfers/transfers-table";

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
      order: {
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          items: { include: { product: { select: { name: true, sku: true } } } },
        },
      },
    },
    orderBy: { transferDate: "desc" },
  });

  const rows = transfers.map((t) => ({
    id: t.id,
    orderNumber: t.order.orderNumber,
    orderId: t.order.id,
    fromCompany: t.fromCompany.name,
    toCompany: t.toCompany.name,
    status: t.status,
    reason: t.reason,
    costAmount: t.costAmount ? Number(t.costAmount) : null,
    transferDate: t.transferDate.toISOString(),
    receivedDate: t.receivedDate?.toISOString() || null,
    items: t.order.items.map((i) => ({
      quantity: i.quantity,
      product: { name: i.product.name, sku: i.product.sku },
    })),
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight">Inter-Company Transfers</h1>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No transfers" description="No inter-company transfers found." />
        ) : (
          <TransfersTable transfers={rows} />
        )}
      </Card>
    </div>
  );
}
