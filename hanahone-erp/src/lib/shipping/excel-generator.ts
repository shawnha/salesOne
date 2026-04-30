// 3PL purchase-order Excel generation. Uses exceljs because:
//   - The CJ template (templates/3pl-template.xlsx) carries header colors,
//     column widths, autofilter, and cell formatting that buyers expect to
//     see in the generated file.
//   - SheetJS Community Edition (`xlsx`) drops cell-level styles on write.
//   - `xlsx-js-style` only writes styles authored in its own schema; it
//     can't round-trip the styles produced when reading a template.
//   - exceljs reads and writes OOXML styles natively, so loading the
//     template + filling in rows preserves every visual property.
//
// The Naver upload Excel still uses the lightweight `xlsx` package because
// it's a fresh sheet with no styling and Naver only accepts .xls (BIFF8).
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import path from "path";

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

// Column layout in the CJ template (1-indexed for exceljs):
//   A=1 보내는분, B=2 보내는분 연락처, C=3 주소,
//   D=4 번호, E=5 수취인명, F=6 상품명, G=7 수량,
//   H=8 핸드폰, I=9 기타연락처, J=10 주소, K=11 배송메세지,
//   L=12 (공란), M=13 상품고유코드, N=14 배송방식, O=15 운송장번호, P=16 택배사,
//   Q=17 productOrderId (hidden), R=18 batchId (hidden)
const COL = {
  SENDER_NAME: 1,
  SENDER_PHONE: 2,
  SENDER_ADDR: 3,
  ROW_NUM: 4,
  RECIPIENT_NAME: 5,
  PRODUCT_NAME: 6,
  QUANTITY: 7,
  RECIPIENT_PHONE: 8,
  ORDERER_PHONE: 9,
  ADDRESS: 10,
  DELIVERY_MSG: 11,
  TPL_CODE: 13,
  PRODUCT_ORDER_ID: 17,
  BATCH_ID: 18,
} as const;

// ---------------------------------------------------------------------------
// generatePurchaseOrderExcel
// ---------------------------------------------------------------------------

/**
 * Generates a 3PL purchase order Excel by loading the original template
 * and filling in order data. Preserves header colors, fonts, autofilter,
 * and any other formatting the template carries.
 *
 * Adds hidden columns Q/R for productOrderId and batchId so the tracking
 * upload step (excel-parser.ts) can match returned rows back to the batch.
 */
export async function generatePurchaseOrderExcel(
  orders: PurchaseOrderInput[],
): Promise<Buffer> {
  const templatePath = path.join(
    process.cwd(),
    "src/lib/shipping/templates/3pl-template.xlsx",
  );

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath);

  const ws = wb.getWorksheet("1차");
  if (!ws) throw new Error("Template sheet '1차' missing");

  // The shipped CJ template carries ~1354 placeholder data rows (some with
  // example values, the rest empty-but-styled). spliceRows() doesn't
  // actually drop them from the internal `_rows` array on this exceljs
  // version, so the worksheet dimension stays at A1:Q1355 on write and
  // the buyer sees thousands of phantom rows. Truncate _rows directly to
  // keep just the header, then re-populate.
  const wsInternal = ws as unknown as { _rows: unknown[] };
  if (Array.isArray(wsInternal._rows) && wsInternal._rows.length > 1) {
    wsInternal._rows.length = 1;
  }

  // Header is row 1; data rows start at row 2.
  orders.forEach((order, index) => {
    const r = index + 2;
    const row = ws.getRow(r);

    row.getCell(COL.SENDER_NAME).value = SENDER_NAME;
    row.getCell(COL.SENDER_PHONE).value = SENDER_PHONE;
    row.getCell(COL.SENDER_ADDR).value = SENDER_ADDRESS;
    row.getCell(COL.ROW_NUM).value = index + 1;
    row.getCell(COL.RECIPIENT_NAME).value = order.recipientName;
    row.getCell(COL.PRODUCT_NAME).value = order.productName;
    row.getCell(COL.QUANTITY).value = order.quantity;
    row.getCell(COL.RECIPIENT_PHONE).value = order.recipientPhone;
    if (order.ordererPhone) {
      row.getCell(COL.ORDERER_PHONE).value = order.ordererPhone;
    }
    row.getCell(COL.ADDRESS).value = order.shippingAddress;
    if (order.deliveryMessage) {
      row.getCell(COL.DELIVERY_MSG).value = order.deliveryMessage;
    }
    if (order.tplCode) {
      row.getCell(COL.TPL_CODE).value = order.tplCode;
    }
    row.getCell(COL.PRODUCT_ORDER_ID).value = order.productOrderId;
    row.getCell(COL.BATCH_ID).value = order.batchId;

    row.commit();
  });

  // Hide the productOrderId / batchId columns — they're only there for the
  // tracking-upload round trip, not for human eyes.
  ws.getColumn(COL.PRODUCT_ORDER_ID).hidden = true;
  ws.getColumn(COL.BATCH_ID).hidden = true;

  const lastRow = orders.length + 1; // +1 header

  // Update the autofilter to span only the visible columns. The template
  // ships with autofilter on header row 1 across A:P; reapply so it covers
  // the new data range.
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: lastRow, column: 16 },
  };

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

// ---------------------------------------------------------------------------
// generateNaverUploadExcel
// ---------------------------------------------------------------------------

/**
 * Generates a Naver upload Excel in .xls format (required by Naver).
 * Sheet name must be exactly "발송처리". No styling, fresh sheet — using
 * the lightweight `xlsx` package is fine here.
 */
export function generateNaverUploadExcel(
  items: NaverUploadInput[],
  carrier: string = DEFAULT_CARRIER,
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
