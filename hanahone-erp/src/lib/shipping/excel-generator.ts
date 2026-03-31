import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";

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

const NAVER_UPLOAD_HEADERS = ["상품주문번호", "배송방법", "택배사", "송장번호"];
const NAVER_DELIVERY_METHOD = "택배발송 : 택배,등기,소포";
const DEFAULT_CARRIER = "CJ대한통운";

// ---------------------------------------------------------------------------
// generatePurchaseOrderExcel
// ---------------------------------------------------------------------------

/**
 * Generates a 3PL purchase order Excel by loading the original template file
 * and filling in order data. Preserves all formatting, filters, colors, etc.
 * Adds hidden Q/R columns for productOrderId and batchId.
 */
export function generatePurchaseOrderExcel(orders: PurchaseOrderInput[]): Buffer {
  // Load template
  const templatePath = path.join(process.cwd(), "src/lib/shipping/templates/3pl-template.xlsx");
  const templateBuf = fs.readFileSync(templatePath);
  const wb = XLSX.read(templateBuf, { type: "buffer", cellStyles: true });
  const ws = wb.Sheets["1차"];

  // Row 1 = headers (preserved from template)
  // Row 2 onward = data rows

  // Write order data starting from row 2 (0-indexed: row index 1)
  orders.forEach((order, index) => {
    const r = index + 1; // 1-indexed row in sheet (row 2 = index 1 in 0-based)
    // A: 보내는분
    ws[XLSX.utils.encode_cell({ r, c: 0 })] = { t: "s", v: SENDER_NAME };
    // B: 보내는분 연락처
    ws[XLSX.utils.encode_cell({ r, c: 1 })] = { t: "s", v: SENDER_PHONE };
    // C: 주소
    ws[XLSX.utils.encode_cell({ r, c: 2 })] = { t: "s", v: SENDER_ADDRESS };
    // D: 번호
    ws[XLSX.utils.encode_cell({ r, c: 3 })] = { t: "n", v: index + 1 };
    // E: 수취인명
    ws[XLSX.utils.encode_cell({ r, c: 4 })] = { t: "s", v: order.recipientName };
    // F: 상품명
    ws[XLSX.utils.encode_cell({ r, c: 5 })] = { t: "s", v: order.productName };
    // G: 수량
    ws[XLSX.utils.encode_cell({ r, c: 6 })] = { t: "n", v: order.quantity };
    // H: 핸드폰
    ws[XLSX.utils.encode_cell({ r, c: 7 })] = { t: "s", v: order.recipientPhone };
    // I: 기타연락처
    if (order.ordererPhone) {
      ws[XLSX.utils.encode_cell({ r, c: 8 })] = { t: "s", v: order.ordererPhone };
    }
    // J: 주소
    ws[XLSX.utils.encode_cell({ r, c: 9 })] = { t: "s", v: order.shippingAddress };
    // K: 배송메세지
    if (order.deliveryMessage) {
      ws[XLSX.utils.encode_cell({ r, c: 10 })] = { t: "s", v: order.deliveryMessage };
    }
    // L: (공란) — skip
    // M: 상품고유코드
    if (order.tplCode) {
      ws[XLSX.utils.encode_cell({ r, c: 12 })] = { t: "s", v: order.tplCode };
    }
    // N~P: 배송방식, 운송장번호, 택배사 — blank (3PL fills)
    // Q: productOrderId (숨김)
    ws[XLSX.utils.encode_cell({ r, c: 16 })] = { t: "s", v: order.productOrderId };
    // R: batchId (숨김)
    ws[XLSX.utils.encode_cell({ r, c: 17 })] = { t: "s", v: order.batchId };
  });

  // Update sheet range to include all data rows + Q/R columns
  const lastRow = orders.length + 1; // +1 for header
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow - 1, c: 17 } });

  // Hide Q, R columns
  if (!ws["!cols"]) ws["!cols"] = [];
  for (let i = ws["!cols"].length; i <= 17; i++) {
    ws["!cols"][i] = ws["!cols"][i] || {};
  }
  ws["!cols"][16] = { hidden: true };
  ws["!cols"][17] = { hidden: true };

  // Update autofilter range
  ws["!autofilter"] = { ref: `A1:P${lastRow}` };

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
