/**
 * Print-friendly invoice. No app chrome, no nav. Use the browser's
 * print dialog (Cmd+P) to save as PDF or send to a printer.
 */
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getTrackingUrl } from "@/lib/tracking-url";

const KRW_PLATFORMS = new Set(["NAVER", "COUPANG", "PHARMACY", "GONGGU"]);
const fmt = (n: number, src: string | null) =>
  KRW_PLATFORMS.has(src ?? "")
    ? `₩${Math.round(n).toLocaleString("ko-KR")}`
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export default async function InvoicePage({ params }: { params: { id: string } }) {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      company: true,
      customer: true,
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
  });

  if (!order) return notFound();

  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = order.items.reduce((s, i) => s + Number(i.subtotal), 0);
  const trackUrl = getTrackingUrl(order.trackingCarrier, order.trackingNumber);

  return (
    <div className="invoice-page">
      <style>{`
        body { background: #fff !important; }
        .app-shell, nav, header, footer, .nav, [data-app-chrome] { display: none !important; }
        .invoice-page { max-width: 720px; margin: 0 auto; padding: 32px; color: #111; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; font-size: 13px; line-height: 1.5; }
        .invoice-page h1 { font-size: 24px; font-weight: 700; margin: 0 0 4px; letter-spacing: -0.01em; }
        .invoice-page h2 { font-size: 11px; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: 0.05em; margin: 24px 0 8px; }
        .invoice-page table { width: 100%; border-collapse: collapse; margin-top: 4px; }
        .invoice-page th, .invoice-page td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: left; }
        .invoice-page th { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; background: #f9fafb; }
        .invoice-page td.num, .invoice-page th.num { text-align: right; font-variant-numeric: tabular-nums; }
        .invoice-page .row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .invoice-page .kv { display: flex; justify-content: space-between; padding: 4px 0; }
        .invoice-page .kv span:first-child { color: #6b7280; }
        .invoice-page .totals { margin-top: 16px; margin-left: auto; max-width: 280px; }
        .invoice-page .totals .total { border-top: 1px solid #111; padding-top: 8px; font-weight: 700; font-size: 14px; }
        .print-hint { position: fixed; top: 16px; right: 16px; background: #111; color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 12px; }
        @media print {
          .print-hint, .no-print { display: none !important; }
          @page { margin: 0.5in; }
        }
      `}</style>

      <div className="print-hint no-print">⌘P 로 PDF 저장 또는 인쇄</div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h1>INVOICE</h1>
          <div style={{ color: "#6b7280" }}>{order.externalOrderNumber || order.orderNumber}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{order.company.name}</div>
          <div style={{ color: "#6b7280", fontSize: 11 }}>HanahOne Group</div>
        </div>
      </div>

      <div className="row">
        <div>
          <h2>청구 / Bill To</h2>
          <div style={{ fontWeight: 600 }}>{order.customer?.name ?? order.recipientName ?? "—"}</div>
          {order.recipientName && order.customer?.name && order.recipientName !== order.customer.name && (
            <div style={{ color: "#6b7280" }}>수령인: {order.recipientName}</div>
          )}
          {order.recipientPhone && <div style={{ color: "#6b7280", fontFamily: "ui-monospace, monospace" }}>{order.recipientPhone}</div>}
          {order.shippingAddress && <div style={{ color: "#6b7280" }}>{order.shippingAddress}</div>}
        </div>
        <div>
          <h2>상세 / Details</h2>
          <div className="kv"><span>주문일</span><span>{order.orderDate.toLocaleDateString("ko-KR")}</span></div>
          {order.shipDate && <div className="kv"><span>출고일</span><span>{order.shipDate.toLocaleDateString("ko-KR")}</span></div>}
          {order.deliveredAt && <div className="kv"><span>배송완료</span><span>{order.deliveredAt.toLocaleDateString("ko-KR")}</span></div>}
          <div className="kv"><span>채널</span><span>{order.externalSource ?? "Manual"}</span></div>
          <div className="kv"><span>결제상태</span><span>{order.financialStatus}</span></div>
          {order.trackingNumber && (
            <div className="kv">
              <span>운송장</span>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
                {order.trackingCarrier && <>{order.trackingCarrier} · </>}
                {trackUrl ? <a href={trackUrl} style={{ color: "#0f766e" }}>{order.trackingNumber}</a> : order.trackingNumber}
              </span>
            </div>
          )}
        </div>
      </div>

      <h2>품목 / Items</h2>
      <table>
        <thead>
          <tr>
            <th>상품</th>
            <th className="num">수량</th>
            <th className="num">단가</th>
            <th className="num">소계</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((it) => (
            <tr key={it.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{it.product.name}</div>
                {it.externalVariantName && it.externalVariantName !== it.product.name && (
                  <div style={{ color: "#6b7280", fontSize: 11 }}>{it.externalVariantName}</div>
                )}
                <div style={{ color: "#9ca3af", fontSize: 10, fontFamily: "ui-monospace, monospace" }}>{it.product.sku}</div>
              </td>
              <td className="num">{it.quantity}</td>
              <td className="num">{fmt(Number(it.unitPrice), order.externalSource)}</td>
              <td className="num">{fmt(Number(it.subtotal), order.externalSource)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="totals">
        <div className="kv"><span>소계 ({totalQty}개)</span><span>{fmt(subtotal, order.externalSource)}</span></div>
        {order.refundAmount && Number(order.refundAmount) > 0 && (
          <div className="kv" style={{ color: "#dc2626" }}>
            <span>환불</span><span>-{fmt(Number(order.refundAmount), order.externalSource)}</span>
          </div>
        )}
        {order.commissionAmount && Number(order.commissionAmount) > 0 && (
          <div className="kv" style={{ color: "#92400e" }}>
            <span>수수료</span><span>-{fmt(Number(order.commissionAmount), order.externalSource)}</span>
          </div>
        )}
        <div className="kv total">
          <span>합계</span>
          <span>{fmt(Number(order.netAmount ?? order.totalAmount), order.externalSource)}</span>
        </div>
        {order.settlementAmount && (
          <div className="kv" style={{ color: "#6b7280", fontSize: 11, marginTop: 4 }}>
            <span>정산 금액</span><span>{fmt(Number(order.settlementAmount), order.externalSource)}</span>
          </div>
        )}
      </div>

      {order.notes && (
        <>
          <h2>메모</h2>
          <div style={{ color: "#374151" }}>{order.notes}</div>
        </>
      )}

      <div style={{ marginTop: 48, paddingTop: 16, borderTop: "1px solid #e5e7eb", color: "#9ca3af", fontSize: 10, textAlign: "center" }}>
        Generated by HanahOne ERP · {new Date().toLocaleDateString("ko-KR")}
      </div>
    </div>
  );
}
