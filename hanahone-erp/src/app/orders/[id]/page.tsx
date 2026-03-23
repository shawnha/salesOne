import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table";
import { notFound } from "next/navigation";
import Link from "next/link";

const formatWon = (n: number) => `₩${n.toLocaleString()}`;

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      onBehalfOfCustomer: true,
      company: { select: { name: true } },
      items: { include: { product: { select: { name: true, sku: true } } } },
      transfer: {
        include: {
          fromCompany: { select: { name: true } },
          toCompany: { select: { name: true } },
        },
      },
    },
  });

  if (!order) return notFound();

  const statusTransitions: Record<string, string[]> = {
    PENDING: ["PROCESSING", "CANCELLED"],
    PROCESSING: ["SHIPPED", "CANCELLED"],
    SHIPPED: ["DELIVERED"],
  };

  const nextStatuses = statusTransitions[order.status] ?? [];

  const itemColumns = [
    {
      key: "product",
      header: "Product",
      render: (row: (typeof order.items)[0]) => (
        <span className="font-semibold">{row.product.name}</span>
      ),
    },
    {
      key: "sku",
      header: "SKU",
      render: (row: (typeof order.items)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.product.sku}</span>
      ),
    },
    {
      key: "quantity",
      header: "Qty",
      align: "right" as const,
      render: (row: (typeof order.items)[0]) => (
        <span className="font-semibold">{row.quantity}</span>
      ),
    },
    {
      key: "unitPrice",
      header: "Unit Price",
      align: "right" as const,
      render: (row: (typeof order.items)[0]) => (
        <span className="text-[var(--text-secondary)]">{formatWon(Number(row.unitPrice))}</span>
      ),
    },
    {
      key: "subtotal",
      header: "Subtotal",
      align: "right" as const,
      render: (row: (typeof order.items)[0]) => (
        <span className="font-semibold">{formatWon(Number(row.subtotal))}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/orders" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm">
          &larr; Orders
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{order.orderNumber}</h1>
        <Badge status={order.status} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <h2 className="text-sm font-bold mb-4">Order Information</h2>
          <div className="space-y-3 text-[13px]">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Company</span>
              <span className="font-semibold">{order.company.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Type</span>
              <Badge status={order.type} />
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Customer</span>
              <span className="font-semibold">
                {order.customer ? (
                  <Link href={`/customers/${order.customer.id}`} className="text-accent hover:underline">
                    {order.customer.name}
                  </Link>
                ) : (
                  "—"
                )}
              </span>
            </div>
            {order.onBehalfOfCustomer && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">On behalf of</span>
                <span className="font-semibold">{order.onBehalfOfCustomer.name}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Order Date</span>
              <span className="font-semibold">{new Date(order.orderDate).toLocaleDateString("ko-KR")}</span>
            </div>
            {order.shipDate && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Ship Date</span>
                <span className="font-semibold">{new Date(order.shipDate).toLocaleDateString("ko-KR")}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Total Amount</span>
              <span className="font-semibold">{formatWon(Number(order.totalAmount))}</span>
            </div>
            {order.costAmount && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Cost</span>
                <span className="font-semibold">{formatWon(Number(order.costAmount))}</span>
              </div>
            )}
            {order.marginAmount && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Margin</span>
                <span className="font-semibold">{formatWon(Number(order.marginAmount))}</span>
              </div>
            )}
            {order.notes && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Notes</span>
                <span className="font-semibold">{order.notes}</span>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-bold mb-4">Status Management</h2>
          <div className="space-y-3">
            <p className="text-[13px] text-[var(--text-secondary)]">
              Current status: <Badge status={order.status} />
            </p>
            {nextStatuses.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {nextStatuses.map((status) => (
                  <Button
                    key={status}
                    variant={status === "CANCELLED" ? "secondary" : "primary"}
                    size="sm"
                  >
                    Mark as {status.charAt(0) + status.slice(1).toLowerCase()}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-tertiary)]">No further transitions available.</p>
            )}
          </div>

          {order.transfer && (
            <div className="mt-6 pt-4 border-t border-[var(--border)]">
              <h3 className="text-sm font-bold mb-3">Transfer Details</h3>
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">From</span>
                  <span className="font-semibold">{order.transfer.fromCompany.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">To</span>
                  <span className="font-semibold">{order.transfer.toCompany.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Transfer Status</span>
                  <Badge status={order.transfer.status} />
                </div>
                <Link href={`/transfers/${order.transfer.id}`} className="text-xs text-accent hover:underline">
                  View transfer details &rarr;
                </Link>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-bold mb-4">Order Items</h2>
        {order.items.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">No items in this order.</p>
        ) : (
          <DataTable columns={itemColumns} data={order.items} />
        )}
      </Card>
    </div>
  );
}
