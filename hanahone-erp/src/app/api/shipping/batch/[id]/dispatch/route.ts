/**
 * Round dispatch — 송장번호를 채널 API로 자동 전송.
 *
 * 라운드 안의 items를 채널별로 분리:
 *   - NAVER → POST /pay-order/seller/product-orders/dispatch (한 번에)
 *   - COUPANG → ① PUT acknowledgement → ② POST /orders/invoices
 *
 * 결과: { naver: { ok, failed[] }, coupang: { ok, failed[] } } + batch.channelDispatch 업데이트.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";
import { decrypt } from "@/lib/integrations/encryption";
import { dispatchNaverOrders, type NaverDispatchItem, carrierToNaverCode } from "@/lib/integrations/naver/dispatch";
import {
  acknowledgeCoupangShipmentBoxes,
  uploadCoupangInvoices,
  type CoupangDispatchItem,
} from "@/lib/integrations/coupang/dispatch";
import type { NaverCredentials } from "@/lib/integrations/naver/types";
import type { CoupangCredentials } from "@/lib/integrations/connectors/coupang";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  const batchId = params.id;
  const batch = await prisma.shippingBatch.findUnique({
    where: { id: batchId },
    include: {
      items: {
        include: {
          order: {
            select: {
              id: true,
              externalOrderNumber: true,
              externalSource: true,
              items: {
                select: { externalVariantSku: true, quantity: true },
              },
            },
          },
        },
      },
    },
  });

  if (!batch) {
    return NextResponse.json({ error: "라운드를 찾을 수 없습니다" }, { status: 404 });
  }

  // 송장번호 누락 확인
  const missing = batch.items.filter((i) => !i.trackingNumber);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `송장번호가 비어있는 행 ${missing.length}건. 송장 회신 Excel 업로드를 먼저 완료하세요.` },
      { status: 400 },
    );
  }

  // 회사의 NAVER + COUPANG 자격증명 fetch
  const [naverConfig, coupangConfig] = await Promise.all([
    prisma.integrationConfig.findFirst({
      where: { companyId: batch.companyId, platform: "NAVER", isActive: true },
    }),
    prisma.integrationConfig.findFirst({
      where: { companyId: batch.companyId, platform: "COUPANG", isActive: true },
    }),
  ]);

  // 채널별 분리
  const naverItems: NaverDispatchItem[] = [];
  const coupangItems: CoupangDispatchItem[] = [];
  const carrierCode = carrierToNaverCode(batch.carrier);

  for (const item of batch.items) {
    if (!item.trackingNumber) continue;
    const platform = item.platform || item.order?.externalSource;
    if (platform === "NAVER") {
      naverItems.push({
        productOrderId: item.productOrderId,
        trackingNumber: item.trackingNumber,
        deliveryCompanyCode: carrierCode,
      });
    } else if (platform === "COUPANG") {
      // 쿠팡은 vendorItemId 필요. OrderItem.externalVariantSku에 저장돼있음.
      const vendorItemId = item.order?.items?.[0]?.externalVariantSku;
      if (!vendorItemId) {
        // skip — 별도 실패 카운트
        coupangItems.push({
          shipmentBoxId: item.productOrderId,
          orderId: item.order?.externalOrderNumber ?? "",
          vendorItemId: "",
          trackingNumber: item.trackingNumber,
        });
        continue;
      }
      coupangItems.push({
        shipmentBoxId: item.productOrderId,
        orderId: item.order?.externalOrderNumber ?? "",
        vendorItemId,
        trackingNumber: item.trackingNumber,
      });
    }
  }

  const result: {
    naver: { ok: number; failed: Array<{ productOrderId: string; error: string }> };
    coupang: { ok: number; failed: Array<{ shipmentBoxId: string; error: string }> };
  } = {
    naver: { ok: 0, failed: [] },
    coupang: { ok: 0, failed: [] },
  };

  // === NAVER dispatch ===
  if (naverItems.length > 0) {
    if (!naverConfig) {
      result.naver.failed = naverItems.map((it) => ({
        productOrderId: it.productOrderId,
        error: "Naver 자격증명 없음",
      }));
    } else {
      try {
        const credentials: NaverCredentials = JSON.parse(decrypt(naverConfig.credentials));
        const r = await dispatchNaverOrders(credentials, naverItems);
        result.naver = r;
      } catch (err) {
        result.naver.failed = naverItems.map((it) => ({
          productOrderId: it.productOrderId,
          error: (err as Error).message,
        }));
      }
    }
  }

  // === COUPANG dispatch (2-step) ===
  if (coupangItems.length > 0) {
    // vendorItemId 누락된 것 먼저 분리
    const validCoupang = coupangItems.filter((it) => it.vendorItemId);
    const invalidCoupang = coupangItems.filter((it) => !it.vendorItemId);
    for (const it of invalidCoupang) {
      result.coupang.failed.push({
        shipmentBoxId: it.shipmentBoxId,
        error: "vendorItemId 누락 (OrderItem.externalVariantSku 비어있음)",
      });
    }

    if (validCoupang.length > 0) {
      if (!coupangConfig) {
        for (const it of validCoupang) {
          result.coupang.failed.push({
            shipmentBoxId: it.shipmentBoxId,
            error: "Coupang 자격증명 없음",
          });
        }
      } else {
        try {
          const credentials: CoupangCredentials = JSON.parse(decrypt(coupangConfig.credentials));
          // Step 1: acknowledgement (실패해도 invoice 업로드 시도)
          const boxIds = Array.from(new Set(validCoupang.map((it) => it.shipmentBoxId)));
          await acknowledgeCoupangShipmentBoxes(credentials, boxIds).catch(() => null);
          // Step 2: invoice upload
          const r = await uploadCoupangInvoices(credentials, validCoupang);
          result.coupang.ok += r.ok;
          result.coupang.failed.push(...r.failed);
        } catch (err) {
          for (const it of validCoupang) {
            result.coupang.failed.push({
              shipmentBoxId: it.shipmentBoxId,
              error: (err as Error).message,
            });
          }
        }
      }
    }
  }

  // === batch.channelDispatch 업데이트 + 상태 변경 ===
  const channelDispatch: Record<string, string> = (batch.channelDispatch as Record<string, string>) ?? {};
  if (naverItems.length > 0) {
    channelDispatch.NAVER = result.naver.failed.length === 0 ? "COMPLETED" : "PARTIAL";
  }
  if (coupangItems.length > 0) {
    channelDispatch.COUPANG = result.coupang.failed.length === 0 ? "COMPLETED" : "PARTIAL";
  }
  const allChannels = Object.values(channelDispatch);
  const allDone = allChannels.every((s) => s === "COMPLETED");
  const newStatus = allDone ? "COMPLETED" : "SHIPPED";

  await prisma.shippingBatch.update({
    where: { id: batchId },
    data: { channelDispatch, status: newStatus },
  });

  // 성공한 주문은 fulfillmentStatus → FULFILLED + shipDate 세팅
  const successfulOrderIds = new Set<string>();
  for (const item of batch.items) {
    const platform = item.platform || item.order?.externalSource;
    if (!item.trackingNumber || !item.order) continue;
    if (platform === "NAVER" && !result.naver.failed.some((f) => f.productOrderId === item.productOrderId)) {
      successfulOrderIds.add(item.order.id);
    } else if (platform === "COUPANG" && !result.coupang.failed.some((f) => f.shipmentBoxId === item.productOrderId)) {
      successfulOrderIds.add(item.order.id);
    }
  }
  if (successfulOrderIds.size > 0) {
    await prisma.order.updateMany({
      where: { id: { in: Array.from(successfulOrderIds) } },
      data: { fulfillmentStatus: "FULFILLED", shipDate: new Date() },
    });
  }

  return NextResponse.json({
    success: true,
    naver: result.naver,
    coupang: result.coupang,
    batchStatus: newStatus,
    fulfilledOrders: successfulOrderIds.size,
  });
}
