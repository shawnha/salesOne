import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table";
import { TransferEditFields } from "@/components/transfers/transfer-edit-fields";
import { notFound } from "next/navigation";
import Link from "next/link";

const formatWon = (n: number) => `₩${n.toLocaleString()}`;

export default async function TransferDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const transfer = await prisma.interCompanyTransfer.findUnique({
    where: { id: params.id },
    include: {
      fromCompany: { select: { name: true } },
      toCompany: { select: { name: true } },
      order: {
        include: {
          items: { include: { product: { select: { name: true, sku: true } } } },
        },
      },
    },
  });

  if (!transfer) return notFound();

  const statusTransitions: Record<string, string[]> = {
    PENDING: ["SHIPPED", "CANCELLED"],
    SHIPPED: ["RECEIVED"],
  };

  const nextStatuses = statusTransitions[transfer.status] ?? [];

  const itemColumns = [
    {
      key: "product",
      header: "Product",
      render: (row: (typeof transfer.order.items)[0]) => (
        <span className="font-semibold">{row.product.name}</span>
      ),
    },
    {
      key: "sku",
      header: "SKU",
      render: (row: (typeof transfer.order.items)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.product.sku}</span>
      ),
    },
    {
      key: "quantity",
      header: "Qty",
      align: "right" as const,
      render: (row: (typeof transfer.order.items)[0]) => (
        <span className="font-semibold">{row.quantity}</span>
      ),
    },
    {
      key: "unitPrice",
      header: "Unit Price",
      align: "right" as const,
      render: (row: (typeof transfer.order.items)[0]) => (
        <span className="text-[var(--text-secondary)]">{formatWon(Number(row.unitPrice))}</span>
      ),
    },
    {
      key: "subtotal",
      header: "Subtotal",
      align: "right" as const,
      render: (row: (typeof transfer.order.items)[0]) => (
        <span className="font-semibold">{formatWon(Number(row.subtotal))}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/transfers" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm">
          &larr; Transfers
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Transfer: {transfer.order.orderNumber}</h1>
        <Badge status={transfer.status} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <h2 className="text-sm font-bold mb-4">Transfer Information</h2>
          <div className="space-y-3 text-[13px]">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">From</span>
              <span className="font-semibold">{transfer.fromCompany.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">To</span>
              <span className="font-semibold">{transfer.toCompany.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Status</span>
              <Badge status={transfer.status} />
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Transfer Date</span>
              <span className="font-semibold">{new Date(transfer.transferDate).toLocaleDateString("ko-KR")}</span>
            </div>
            {transfer.receivedDate && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Received Date</span>
                <span className="font-semibold">{new Date(transfer.receivedDate).toLocaleDateString("ko-KR")}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Total Amount</span>
              <span className="font-semibold">{formatWon(Number(transfer.order.totalAmount))}</span>
            </div>
            {transfer.reason && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Reason</span>
                <span className="font-semibold">{transfer.reason}</span>
              </div>
            )}
            {transfer.costAmount && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Cost</span>
                <span className="font-semibold text-amber-400">${Number(transfer.costAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-3">Edit Details</h3>
            <TransferEditFields
              transferId={transfer.id}
              initialReason={transfer.reason}
              initialCostAmount={transfer.costAmount ? Number(transfer.costAmount) : null}
            />
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-bold mb-4">Status Management</h2>
          <div className="space-y-3">
            <p className="text-[13px] text-[var(--text-secondary)]">
              Current status: <Badge status={transfer.status} />
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

          <div className="mt-6 pt-4 border-t border-[var(--border)]">
            <Link href={`/orders/${transfer.orderId}`} className="text-xs text-accent hover:underline">
              View linked order &rarr;
            </Link>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-bold mb-4">Transfer Items</h2>
        {transfer.order.items.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">No items in this transfer.</p>
        ) : (
          <DataTable columns={itemColumns} data={transfer.order.items} />
        )}
      </Card>
    </div>
  );
}
