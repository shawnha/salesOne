"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface OrderItem {
  id: string;
  quantity: number;
  product: { name: string; sku: string } | null;
}

interface PendingOrder {
  id: string;
  orderNumber: string;
  totalAmount: string | number;
  customer: { name: string } | null;
  items: OrderItem[];
}

interface ShippingBatch {
  id: string;
  createdAt: string;
  status: string;
  carrier: string | null;
  _count?: { orders: number };
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "대기",
  SHIPPED: "송장 완료",
  COMPLETED: "발송 완료",
};

const STATUS_BADGE_VARIANT: Record<string, string> = {
  PENDING: "pending",
  SHIPPED: "shipped",
  COMPLETED: "completed",
};

export function NaverShippingManager({ companyId }: { companyId: string }) {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [batches, setBatches] = useState<ShippingBatch[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [naverDownloading, setNaverDownloading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const res = await fetch(
        `/api/orders?companyId=${companyId}&fulfillmentStatus=UNFULFILLED&externalSource=NAVER`
      );
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } finally {
      setLoadingOrders(false);
    }
  }, [companyId]);

  const fetchBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      const res = await fetch(`/api/shipping/batch?companyId=${companyId}`);
      if (res.ok) {
        const data = await res.json();
        setBatches(data);
      }
    } finally {
      setLoadingBatches(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchOrders();
    fetchBatches();
  }, [fetchOrders, fetchBatches]);

  function toggleAll() {
    if (selected.size === orders.length && orders.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(orders.map((o) => o.id)));
    }
  }

  function toggleOrder(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDownloadBatch() {
    if (selected.size === 0) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/shipping/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, orderIds: Array.from(selected) }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "다운로드 실패");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `naver_batch_${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setSelected(new Set());
      await Promise.all([fetchOrders(), fetchBatches()]);
    } catch {
      alert("네트워크 오류");
    } finally {
      setDownloading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", companyId);
      const res = await fetch("/api/shipping/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      alert(res.ok ? (data.message || "업로드 완료") : (data.error || "업로드 실패"));
      await fetchBatches();
    } catch {
      alert("네트워크 오류");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleNaverDownload(batchId: string) {
    setNaverDownloading(batchId);
    try {
      const res = await fetch(`/api/shipping/batch/${batchId}/naver-upload`);
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "다운로드 실패");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `naver_upload_${batchId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("네트워크 오류");
    } finally {
      setNaverDownloading(null);
    }
  }

  const allSelected = orders.length > 0 && selected.size === orders.length;

  return (
    <div className="space-y-6">
      {/* Section 1: 발송 대기 주문 */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold">발송 대기 주문</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAll}
              disabled={orders.length === 0}
            >
              {allSelected ? "전체 해제" : "전체 선택"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleDownloadBatch}
              disabled={selected.size === 0 || downloading}
            >
              {downloading ? "처리중..." : `3PL 발주서 다운로드 (${selected.size})`}
            </Button>
          </div>
        </div>

        {loadingOrders ? (
          <p className="text-sm text-[var(--text-secondary)]">불러오는 중...</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">발송 대기 주문이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <label
                key={order.id}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150 ${
                  selected.has(order.id)
                    ? "border-accent bg-[var(--accent-dim)]"
                    : "border-[var(--border)] hover:border-[var(--border-strong)]"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 accent-[var(--accent)] flex-shrink-0"
                  checked={selected.has(order.id)}
                  onChange={() => toggleOrder(order.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{order.orderNumber}</span>
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      ₩{Number(order.totalAmount).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {order.customer?.name || "—"}
                  </p>
                  {order.items.length > 0 && (
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                      {order.items
                        .map((item) => `${item.product?.name || item.product?.sku || "상품"} x${item.quantity}`)
                        .join(", ")}
                    </p>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
      </Card>

      {/* Section 2: 송장 업로드 */}
      <Card className="p-5">
        <h2 className="text-sm font-bold mb-4">송장 업로드</h2>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          variant="secondary"
          size="md"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "업로드 중..." : "3PL 송장 파일 업로드"}
        </Button>
      </Card>

      {/* Section 3: 발주 이력 */}
      <Card className="p-5">
        <h2 className="text-sm font-bold mb-4">발주 이력</h2>
        {loadingBatches ? (
          <p className="text-sm text-[var(--text-secondary)]">불러오는 중...</p>
        ) : batches.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">발주 이력이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {batches.map((batch) => (
              <div
                key={batch.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border)]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Badge status={STATUS_BADGE_VARIANT[batch.status] || batch.status} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">
                      {new Date(batch.createdAt).toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      {STATUS_LABELS[batch.status] || batch.status}
                      {batch._count?.orders != null && ` · ${batch._count.orders}건`}
                      {batch.carrier && ` · ${batch.carrier}`}
                    </p>
                  </div>
                </div>
                {batch.status === "SHIPPED" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleNaverDownload(batch.id)}
                    disabled={naverDownloading === batch.id}
                  >
                    {naverDownloading === batch.id ? "..." : "네이버 파일 다운로드"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
