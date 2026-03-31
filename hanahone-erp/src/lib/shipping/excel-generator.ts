import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PurchaseOrderInput {
  recipientName: string;
  productName: string;
  quantity: number;
  recipientPhone: string;
  ordererPhone?: string;
  shippingAddress: string;
  deliveryMessage?: string;
  tplCode?: string;
  productOrderId: string;
  batchId: string;
}

export interface NaverUploadInput {
  productOrderId: string;
  trackingNumber: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SENDER_NAME = "한아원";
const SENDER_PHONE = "010-7701-2732";
const SENDER_ADDRESS = "서초구 서초대로60길 18, 한아원 9층";

const PURCHASE_ORDER_HEADERS = [
  "보내는분",
  "보내는분 연락처",
  "주소 ",
  "번호",
  "수취인명",
  "상품명",
  "수량",
  "핸드폰",
  "기타연락처",
  "주소",
  "배송메세지",
  "",
  "상품고유코드",
  "배송방식",
  "운송장번호",
  "택배사",
  "productOrderId",
  "batchId",
];

const NAVER_UPLOAD_HEADERS = ["상품주문번호", "배송방법", "택배사", "송장번호"];
const NAVER_DELIVERY_METHOD = "택배발송 : 택배,등기,소포";
const DEFAULT_CARRIER = "CJ대한통운";

// ---------------------------------------------------------------------------
// generatePurchaseOrderExcel
// ---------------------------------------------------------------------------

/**
 * Generates a 3PL purchase order Excel workbook.
 * Sheet "1차": one row per order with fixed sender info + order data.
 * Sheet "참조": unique productName → tplCode mapping.
 */
export function generatePurchaseOrderExcel(orders: PurchaseOrderInput[]): Buffer {
  const wb = XLSX.utils.book_new();

  // ── "1차" sheet ──────────────────────────────────────────────────────────
  const mainRows: (string | number)[][] = [PURCHASE_ORDER_HEADERS];

  orders.forEach((order, index) => {
    const row: (string | number)[] = [
      SENDER_NAME,                        // 0 보내는분
      SENDER_PHONE,                       // 1 보내는분 연락처
      SENDER_ADDRESS,                     // 2 주소 (sender)
      index + 1,                          // 3 번호
      order.recipientName,                // 4 수취인명
      order.productName,                  // 5 상품명
      order.quantity,                     // 6 수량
      order.recipientPhone,               // 7 핸드폰
      order.ordererPhone ?? "",           // 8 기타연락처
      order.shippingAddress,              // 9 주소
      order.deliveryMessage ?? "",        // 10 배송메세지
      "",                                 // 11 공란
      order.tplCode ?? "",                // 12 상품고유코드
      "",                                 // 13 배송방식
      "",                                 // 14 운송장번호
      "",                                 // 15 택배사
      order.productOrderId,               // 16 productOrderId
      order.batchId,                      // 17 batchId
    ];
    mainRows.push(row);
  });

  const mainWs = XLSX.utils.aoa_to_sheet(mainRows);
  XLSX.utils.book_append_sheet(wb, mainWs, "1차");

  // ── "참조" sheet ─────────────────────────────────────────────────────────
  const seen = new Map<string, string>();
  for (const order of orders) {
    if (!seen.has(order.productName)) {
      seen.set(order.productName, order.tplCode ?? "");
    }
  }

  const refRows: string[][] = [["상품명", "상품고유코드"]];
  for (const [productName, tplCode] of Array.from(seen)) {
    refRows.push([productName, tplCode]);
  }

  const refWs = XLSX.utils.aoa_to_sheet(refRows);
  XLSX.utils.book_append_sheet(wb, refWs, "참조");

  const xlsxBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(xlsxBuf);
}

// ---------------------------------------------------------------------------
// generateNaverUploadExcel
// ---------------------------------------------------------------------------

/**
 * Generates a Naver upload Excel in .xls format (required by Naver).
 * Sheet name must be exactly "발송처리".
 */
export function generateNaverUploadExcel(
  items: NaverUploadInput[],
  carrier: string = DEFAULT_CARRIER
): Buffer {
  const wb = XLSX.utils.book_new();

  const rows: (string | number)[][] = [NAVER_UPLOAD_HEADERS];

  for (const item of items) {
    rows.push([
      item.productOrderId,    // 상품주문번호
      NAVER_DELIVERY_METHOD,  // 배송방법
      carrier,                // 택배사
      item.trackingNumber,    // 송장번호
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "발송처리");

  const xlsBuf = XLSX.write(wb, { type: "buffer", bookType: "xls" });
  return Buffer.from(xlsBuf);
}
