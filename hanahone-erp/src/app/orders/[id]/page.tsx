import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/table";
import { notFound } from "next/navigation";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { OrderStatusChanger } from "@/components/orders/OrderStatusChanger";
import { categorize, CATEGORY_LABELS, CATEGORY_COLORS } from "@/lib/product-category";
import { getTrackingUrl } from "@/lib/tracking-url";

const formatUSD = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const formatKRW = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;
const KRW_PLATFORMS = new Set(["NAVER", "COUPANG", "PHARMACY", "GONGGU"]);
const fmt = (n: number, platform: string | null) =>
  KRW_PLATFORMS.has(platform || "") ? formatKRW(n) : formatUSD(n);

const platformLabels: Record<string, string> = {
  SHOPIFY: "Shopify",
  AMAZON: "Amazon",
  TIKTOK: "TikTok",
  NAVER: "네이버",
  COUPANG: "쿠팡",
  PHARMACY: "약국",
};

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

  // Get refund timeline from raw external order data
  const externalOrder = await prisma.externalOrder.findFirst({
    where: { mappedOrderId: order.id },
    select: { rawData: true },
  });
  const rawRefunds = (externalOrder?.rawData as any)?.refunds || [];
  const refundTimeline = rawRefunds.map((r: any) => ({
    date: r.created_at ? new Date(r.created_at) : null,
    note: r.note || null,
    amount: (r.transactions || []).reduce((s: number, t: any) => s + parseFloat(t.amount || "0"), 0),
    items: (r.refund_line_items || []).map((li: any) => ({
      title: li.line_item?.title || "Unknown",
      quantity: li.quantity,
      subtotal: parseFloat(li.subtotal || "0"),
    })),
  }));

  const itemColumns = [
    {
      key: "product",
      header: "Product",
      render: (row: (typeof order.items)[0]) => {
        const showVariant =
          row.externalVariantName &&
          row.externalVariantName.trim() !== "" &&
          row.externalVariantName !== row.product.name;
        const cat = categorize({
          masterSku: row.product.sku,
          variantName: row.externalVariantName,
          sellingPlanId: row.sellingPlanId,
        });
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{row.product.name}</span>
            {cat !== "other" && (
              <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${CATEGORY_COLORS[cat]}`}>
                {CATEGORY_LABELS[cat]}
              </span>
            )}
            {showVariant && (
              <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded text-indigo-600 bg-indigo-500/[0.08]">
                {row.externalVariantName}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "sku",
      header: "SKU",
      render: (row: (typeof order.items)[0]) => {
        const showVariantSku =
          row.externalVariantSku &&
          row.externalVariantSku !== row.product.sku;
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[var(--text-secondary)]">{row.product.sku}</span>
            {showVariantSku && (
              <span className="text-[10px] text-[var(--text-tertiary)]">
                (채널: {row.externalVariantSku})
              </span>
            )}
          </div>
        );
      },
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
      render: (row: (typeof order.items)[0]) => {
        const list = row.originalUnitPrice != null ? Number(row.originalUnitPrice) : null;
        const paid = Number(row.unitPrice);
        const showList = list != null && Math.abs(list - paid) > 0.01;
        return (
          <div className="text-right">
            <span className="text-[var(--text-secondary)]">{fmt(paid, order.externalSource)}</span>
            {showList && (
              <div className="text-[10px] text-[var(--text-tertiary)]">
                정가 {fmt(list, order.externalSource)}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "subtotal",
      header: "Subtotal",
      align: "right" as const,
      render: (row: (typeof order.items)[0]) => (
        <span className="font-semibold">{fmt(Number(row.subtotal), order.externalSource)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/orders" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm">
          &larr; Orders
        </Link>
        <h1 className="text-xl font-bold tracking-tight">
          {order.externalOrderNumber || order.orderNumber}
        </h1>
        <OrderStatusBadge
          fulfillmentStatus={order.fulfillmentStatus}
          financialStatus={order.financialStatus}
        />
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
            {order.externalSource && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Channel</span>
                <span className="font-semibold">{platformLabels[order.externalSource] || order.externalSource}</span>
              </div>
            )}
            {order.externalOrderNumber && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Original Order #</span>
                <span className="font-semibold">{order.externalOrderNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Customer</span>
              <span className="font-semibold">
                {order.customer ? (
                  <Link href={`/customers/${order.customer.id}`} className="text-accent hover:underline">
                    {order.customer.name}
                  </Link>
                ) : "—"}
              </span>
            </div>
            {order.customer?.email && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Email</span>
                <span className="text-[var(--text-secondary)]">{order.customer.email}</span>
              </div>
            )}
            {order.onBehalfOfCustomer && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">On behalf of</span>
                <span className="font-semibold">{order.onBehalfOfCustomer.name}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Order Date</span>
              <span className="font-semibold">{new Date(order.orderDate).toLocaleDateString("en-US")}</span>
            </div>
            {order.shipDate && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Ship Date</span>
                <span className="font-semibold">{new Date(order.shipDate).toLocaleDateString("en-US")}</span>
              </div>
            )}
            {order.deliveredAt && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Delivered</span>
                <span className="font-semibold">{new Date(order.deliveredAt).toLocaleDateString("en-US")}</span>
              </div>
            )}
            {order.trackingNumber && (() => {
              const trackUrl = getTrackingUrl(order.trackingCarrier, order.trackingNumber);
              return (
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Tracking</span>
                  <span className="text-xs">
                    {order.trackingCarrier && (
                      <span className="text-[var(--text-secondary)]">{order.trackingCarrier} · </span>
                    )}
                    {trackUrl ? (
                      <a
                        href={trackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-accent hover:underline"
                      >
                        {order.trackingNumber}
                      </a>
                    ) : (
                      <span className="font-mono">{order.trackingNumber}</span>
                    )}
                  </span>
                </div>
              );
            })()}
            {order.notes && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Notes</span>
                <span className="font-semibold">{order.notes}</span>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-bold mb-4">Status & Financials</h2>
          <div className="space-y-3 text-[13px]">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Fulfillment</span>
              <Badge status={order.fulfillmentStatus} />
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Financial</span>
              <Badge status={order.financialStatus} />
            </div>
            <div className="border-t border-[var(--border)] my-2" />
            <OrderStatusChanger
              orderId={order.id}
              fulfillmentStatus={order.fulfillmentStatus}
              financialStatus={order.financialStatus}
            />
            <div className="border-t border-[var(--border)] my-2" />
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Total Amount</span>
              <span className="font-semibold">{fmt(Number(order.totalAmount), order.externalSource)}</span>
            </div>
            {order.refundAmount && Number(order.refundAmount) > 0 && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Refund</span>
                <span className="font-semibold text-red-500">-{fmt(Number(order.refundAmount), order.externalSource)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Net Amount</span>
              <span className="font-bold text-base">{fmt(Number(order.netAmount ?? order.totalAmount), order.externalSource)}</span>
            </div>
            {order.costAmount && (
              <>
                <div className="border-t border-[var(--border)] my-2" />
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Cost</span>
                  <span className="font-semibold">{fmt(Number(order.costAmount), order.externalSource)}</span>
                </div>
              </>
            )}
            {order.marginAmount && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Margin</span>
                <span className="font-semibold">{fmt(Number(order.marginAmount), order.externalSource)}</span>
              </div>
            )}
            {(order.commissionAmount || order.settlementAmount) && (
              <>
                <div className="border-t border-[var(--border)] my-2" />
                {order.commissionAmount && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">수수료</span>
                    <span className="font-semibold text-amber-600">-{fmt(Number(order.commissionAmount), order.externalSource)}</span>
                  </div>
                )}
                {order.settlementAmount && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">정산 금액</span>
                    <span className="font-semibold">{fmt(Number(order.settlementAmount), order.externalSource)}</span>
                  </div>
                )}
              </>
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

      {refundTimeline.length > 0 && (
        <Card>
          <h2 className="text-sm font-bold mb-4">Refund History</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-[13px]">
              <div className="w-2 h-2 rounded-full bg-teal-500" />
              <div className="flex-1">
                <div className="flex justify-between">
                  <span className="font-semibold">Order Placed</span>
                  <span className="text-[var(--text-secondary)]">
                    {new Date(order.orderDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{fmt(Number(order.totalAmount), order.externalSource)} paid</p>
              </div>
            </div>
            {refundTimeline.map((refund: any, i: number) => (
              <div key={i} className="flex items-start gap-3 text-[13px]">
                <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5" />
                <div className="flex-1">
                  <div className="flex justify-between">
                    <span className="font-semibold text-red-600">Refund</span>
                    <span className="text-[var(--text-secondary)]">
                      {refund.date ? new Date(refund.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </span>
                  </div>
                  <p className="text-xs text-red-500 mt-0.5">-{fmt(refund.amount, order.externalSource)}</p>
                  {refund.note && (
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{refund.note}</p>
                  )}
                  {refund.items.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {refund.items.map((item: any, j: number) => (
                        <div key={j} className="text-xs text-[var(--text-secondary)] flex justify-between">
                          <span>{item.title} x{item.quantity}</span>
                          <span>-{fmt(item.subtotal, order.externalSource)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
