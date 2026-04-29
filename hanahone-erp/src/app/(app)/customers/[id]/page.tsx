import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { notFound } from "next/navigation";
import Link from "next/link";
import { EditableEmail } from "@/components/customers/editable-email";

const formatUSD = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const formatKRW = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;

function formatAmount(n: number, currency: "USD" | "KRW") {
  return currency === "KRW" ? formatKRW(n) : formatUSD(n);
}

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const customer = await prisma.customer.findUnique({
    where: { id: params.id },
    include: {
      company: { select: { name: true } },
      orders: {
        orderBy: { orderDate: "desc" },
        select: {
          id: true,
          orderNumber: true,
          externalOrderNumber: true,
          externalSource: true,
          orderDate: true,
          totalAmount: true,
          refundAmount: true,
          netAmount: true,
          fulfillmentStatus: true,
          financialStatus: true,
          items: {
            select: {
              quantity: true,
              product: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!customer) return notFound();

  const companyName = customer.company.name.toLowerCase();
  const currency: "USD" | "KRW" = (companyName.includes("hoi") || companyName.includes("international")) ? "USD" : "KRW";

  const contactInfo = customer.contactInfo as Record<string, string> | null;

  const totalOrders = customer.orders.length;
  const paidOrders = customer.orders.filter(
    (o) => o.financialStatus === "PAID" || o.financialStatus === "PARTIALLY_PAID"
  );
  const refundedOrders = customer.orders.filter(
    (o) => o.financialStatus === "REFUNDED" || o.financialStatus === "PARTIALLY_REFUNDED"
  );
  const netRevenue = customer.orders.reduce((s, o) => s + Number(o.netAmount ?? o.totalAmount), 0);
  const totalRefunded = refundedOrders.reduce((s, o) => s + Number(o.refundAmount || o.totalAmount), 0);
  const avgOrderValue = paidOrders.length > 0
    ? paidOrders.reduce((s, o) => s + Number(o.netAmount ?? o.totalAmount), 0) / paidOrders.length
    : 0;
  // Orders are already orderBy: orderDate desc → first = most recent
  const lastOrderDate = customer.orders[0]?.orderDate ?? null;
  const firstOrderDate = customer.orders[customer.orders.length - 1]?.orderDate ?? null;
  const daysSinceLast = lastOrderDate
    ? Math.floor((Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  // Channel breakdown
  const channelCounts = new Map<string, number>();
  for (const o of customer.orders) {
    const k = o.externalSource ?? "Manual";
    channelCounts.set(k, (channelCounts.get(k) ?? 0) + 1);
  }
  const channelBreakdown = Array.from(channelCounts.entries()).sort((a, b) => b[1] - a[1]);

  // Product purchase summary
  const productCounts = new Map<string, number>();
  for (const order of customer.orders) {
    for (const item of order.items) {
      const name = item.product?.name || "Unknown";
      productCounts.set(name, (productCounts.get(name) || 0) + item.quantity);
    }
  }
  const topProducts = Array.from(productCounts.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/customers" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm">
          &larr; 고객
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{customer.name}</h1>
        <Badge status={customer.type} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <h2 className="text-sm font-bold mb-4">연락처 정보</h2>
          <div className="space-y-3 text-[13px]">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">회사</span>
              <span className="font-semibold">{customer.company.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">이메일</span>
              <EditableEmail customerId={customer.id} currentEmail={customer.email ?? contactInfo?.email ?? null} />
            </div>
            {contactInfo?.recipientName && contactInfo.recipientName !== customer.name && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">수령인</span>
                <span className="font-semibold">{contactInfo.recipientName}</span>
              </div>
            )}
            {contactInfo?.phone && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">전화</span>
                <span className="font-semibold font-mono text-xs">{contactInfo.phone}</span>
              </div>
            )}
            {contactInfo?.address && (
              <div className="flex justify-between gap-3">
                <span className="text-[var(--text-secondary)] shrink-0">주소</span>
                <span className="font-semibold text-right">
                  {[contactInfo.address, contactInfo.city, contactInfo.state, contactInfo.zip].filter(Boolean).join(", ")}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">가입일</span>
              <span className="font-semibold">{new Date(customer.createdAt).toLocaleDateString("ko-KR")}</span>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-bold mb-4">요약</h2>
          <div className="space-y-3 text-[13px]">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">전체 주문</span>
              <span className="font-semibold">{totalOrders}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">결제 완료</span>
              <span className="font-semibold text-teal-600">{paidOrders.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">환불</span>
              <span className="font-semibold text-red-500">{refundedOrders.length}</span>
            </div>
            {totalRefunded > 0 && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">환불 합계</span>
                <span className="font-semibold text-red-500">-{formatAmount(totalRefunded, currency)}</span>
              </div>
            )}
            <div className="border-t border-[var(--border)] my-2" />
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">순매출</span>
              <span className="font-bold text-base">{formatAmount(netRevenue, currency)}</span>
            </div>
            {avgOrderValue > 0 && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">평균 주문가</span>
                <span className="font-semibold">{formatAmount(avgOrderValue, currency)}</span>
              </div>
            )}
            {firstOrderDate && lastOrderDate && (
              <>
                <div className="border-t border-[var(--border)] my-2" />
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">첫 주문</span>
                  <span className="font-semibold">{firstOrderDate.toLocaleDateString("ko-KR")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">최근 주문</span>
                  <span className="font-semibold">
                    {lastOrderDate.toLocaleDateString("ko-KR")}
                    {daysSinceLast !== null && (
                      <span className="ml-1.5 text-[11px] text-[var(--text-tertiary)]">({daysSinceLast}일 전)</span>
                    )}
                  </span>
                </div>
              </>
            )}
            {channelBreakdown.length > 1 && (
              <>
                <div className="border-t border-[var(--border)] my-2" />
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">채널 분포</span>
                  <div className="mt-2 space-y-1">
                    {channelBreakdown.map(([ch, n]) => (
                      <div key={ch} className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">{ch}</span>
                        <span className="font-semibold">{n}건</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            {topProducts.length > 0 && (
              <>
                <div className="border-t border-[var(--border)] my-2" />
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">구매 상품</span>
                  <div className="mt-2 space-y-1.5">
                    {topProducts.map(([name, qty]) => (
                      <div key={name} className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">{name}</span>
                        <span className="font-semibold">{qty}x</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-bold mb-4">주문 내역</h2>
        {customer.orders.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">주문 없음</p>
        ) : (
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10 bg-[var(--surface)]">
                <tr className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                  <th className="text-left py-3 px-4">주문 #</th>
                  <th className="text-left py-3 px-4">일자</th>
                  <th className="text-left py-3 px-4">상품</th>
                  <th className="text-left py-3 px-4">채널</th>
                  <th className="text-left py-3 px-4">상태</th>
                  <th className="text-right py-3 px-4">금액</th>
                </tr>
              </thead>
              <tbody>
                {customer.orders.map((order) => {
                  const hasRefund = order.refundAmount && Number(order.refundAmount) > 0;
                  return (
                    <tr key={order.id} className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--hover-bg-subtle)]">
                      <td className="py-3 px-4">
                        <Link href={`/orders/${order.id}`} className="font-semibold text-accent hover:underline">
                          {order.externalOrderNumber || order.orderNumber}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        {new Date(order.orderDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        {order.items.length > 0 ? (
                          <div className="space-y-0.5">
                            {order.items.map((item, i) => (
                              <div key={i} className="text-xs">
                                {item.product?.name || "Unknown"}{item.quantity > 1 ? ` x${item.quantity}` : ""}
                              </div>
                            ))}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        {order.externalSource || "Manual"}
                      </td>
                      <td className="py-3 px-4">
                        <OrderStatusBadge
                          fulfillmentStatus={order.fulfillmentStatus}
                          financialStatus={order.financialStatus}
                        />
                      </td>
                      <td className="py-3 px-4 text-right">
                        {hasRefund ? (
                          <div>
                            <span className="line-through text-[var(--text-tertiary)]">{formatAmount(Number(order.totalAmount), currency)}</span>
                            <div className="text-[11px] text-red-500">-{formatAmount(Number(order.refundAmount), currency)}</div>
                          </div>
                        ) : (
                          <span className="font-semibold">{formatAmount(Number(order.totalAmount), currency)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
