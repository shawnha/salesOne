import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  generatePurchaseOrderExcel,
  generateNaverUploadExcel,
  type PurchaseOrderInput,
  type NaverUploadInput,
} from "../excel-generator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSheet(buffer: Buffer, sheetName: string) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(", ")}`);
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];
}

// ---------------------------------------------------------------------------
// generatePurchaseOrderExcel
// ---------------------------------------------------------------------------

const sampleOrder: PurchaseOrderInput = {
  recipientName: "홍길동",
  productName: "한아원 비타민C",
  quantity: 2,
  recipientPhone: "010-1234-5678",
  ordererPhone: "010-9999-0000",
  shippingAddress: "서울시 강남구 테헤란로 123",
  deliveryMessage: "문 앞에 놔주세요",
  tplCode: "VITS-001",
  productOrderId: "ORDER-001",
  batchId: "BATCH-2026-01",
};

const minimalOrder: PurchaseOrderInput = {
  recipientName: "김철수",
  productName: "한아원 오메가3",
  quantity: 1,
  recipientPhone: "010-5555-6666",
  shippingAddress: "부산시 해운대구 센텀로 10",
  productOrderId: "ORDER-002",
  batchId: "BATCH-2026-01",
};

describe("generatePurchaseOrderExcel", () => {
  const EXPECTED_HEADERS_A_TO_P = [
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
    "(공란)",
    "상품고유코드",
    "배송방식",
    "운송장번호",
    "택배사",
  ];

  it("returns a Buffer", async () => {
    const result = await generatePurchaseOrderExcel([sampleOrder]);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("creates sheet named '1차'", async () => {
    const buf = await generatePurchaseOrderExcel([sampleOrder]);
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames).toContain("1차");
  });

  it("has correct headers in row 1 (A-P from template)", async () => {
    const buf = await generatePurchaseOrderExcel([sampleOrder]);
    const rows = readSheet(buf, "1차");
    expect(rows[0].slice(0, 16)).toEqual(EXPECTED_HEADERS_A_TO_P);
  });

  it("fills fixed sender info in columns A-C", async () => {
    const buf = await generatePurchaseOrderExcel([sampleOrder]);
    const rows = readSheet(buf, "1차");
    const dataRow = rows[1];
    expect(dataRow[0]).toBe("한아원");
    expect(dataRow[1]).toBe("010-7701-2732");
    expect(dataRow[2]).toBe("서초구 서초대로60길 18, 한아원 9층");
  });

  it("fills sequential number starting at 1", async () => {
    const buf = await generatePurchaseOrderExcel([sampleOrder, minimalOrder]);
    const rows = readSheet(buf, "1차");
    expect(rows[1][3]).toBe(1);
    expect(rows[2][3]).toBe(2);
  });

  it("maps order fields to correct columns", async () => {
    const buf = await generatePurchaseOrderExcel([sampleOrder]);
    const rows = readSheet(buf, "1차");
    const row = rows[1];
    expect(row[4]).toBe("홍길동");         // 수취인명
    expect(row[5]).toBe("한아원 비타민C");   // 상품명
    expect(row[6]).toBe(2);               // 수량
    expect(row[7]).toBe("010-1234-5678"); // 핸드폰
    expect(row[9]).toBe("서울시 강남구 테헤란로 123"); // 주소
    expect(row[10]).toBe("문 앞에 놔주세요"); // 배송메세지
    expect(row[12]).toBe("VITS-001");     // 상품고유코드
    expect(row[16]).toBe("ORDER-001");    // productOrderId
    expect(row[17]).toBe("BATCH-2026-01"); // batchId
  });

  it("puts ordererPhone in 기타연락처 column (index 8) when present", async () => {
    const buf = await generatePurchaseOrderExcel([sampleOrder]);
    const rows = readSheet(buf, "1차");
    expect(rows[1][8]).toBe("010-9999-0000");
  });

  it("leaves 기타연락처 empty when ordererPhone is absent", async () => {
    const buf = await generatePurchaseOrderExcel([minimalOrder]);
    const rows = readSheet(buf, "1차");
    // cell may be undefined or empty string
    expect(rows[1][8] ?? "").toBe("");
  });

  it("leaves deliveryMessage empty when not provided", async () => {
    const buf = await generatePurchaseOrderExcel([minimalOrder]);
    const rows = readSheet(buf, "1차");
    expect(rows[1][10] ?? "").toBe("");
  });

  it("leaves tplCode empty when not provided", async () => {
    const buf = await generatePurchaseOrderExcel([minimalOrder]);
    const rows = readSheet(buf, "1차");
    expect(rows[1][12] ?? "").toBe("");
  });

  it("column 11 (공란) is empty for every data row", async () => {
    const buf = await generatePurchaseOrderExcel([sampleOrder, minimalOrder]);
    const rows = readSheet(buf, "1차");
    expect(rows[1][11] ?? "").toBe("");
    expect(rows[2][11] ?? "").toBe("");
  });

  it("배송방식, 운송장번호, 택배사 columns (13-15) are empty in data rows", async () => {
    const buf = await generatePurchaseOrderExcel([sampleOrder]);
    const rows = readSheet(buf, "1차");
    expect(rows[1][13] ?? "").toBe(""); // 배송방식
    expect(rows[1][14] ?? "").toBe(""); // 운송장번호
    expect(rows[1][15] ?? "").toBe(""); // 택배사
  });

  it("preserves template header when order list is empty", async () => {
    const buf = await generatePurchaseOrderExcel([]);
    const rows = readSheet(buf, "1차");
    expect(rows[0].slice(0, 16)).toEqual(EXPECTED_HEADERS_A_TO_P);
  });

  it("creates '참조' sheet", async () => {
    const buf = await generatePurchaseOrderExcel([sampleOrder]);
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames).toContain("참조");
  });

  it("'참조' sheet preserves template product mappings", async () => {
    const buf = await generatePurchaseOrderExcel([sampleOrder]);
    const rows = readSheet(buf, "참조");
    // Template has existing product mappings (e.g., ODD products)
    expect(rows.length).toBeGreaterThan(0);
    // First row should have product name and code
    expect(rows[0][0]).toBeDefined();
  });

  it("handles multiple orders with correct row count", async () => {
    const orders = [sampleOrder, minimalOrder, { ...sampleOrder, productOrderId: "ORDER-005" }];
    const buf = await generatePurchaseOrderExcel(orders);
    const rows = readSheet(buf, "1차");
    expect(rows.length).toBe(4); // 1 header + 3 data rows
  });

  it("preserves header fill color from template (yellow on D1-P1)", async () => {
    // This is the regression we're guarding against. Originally the
    // generator round-tripped through SheetJS Community which strips
    // styles on write, leaving a colorless purchase order. exceljs
    // preserves the yellow header fill from the template.
    const buf = await generatePurchaseOrderExcel([sampleOrder]);
    const ExcelJSMod = (await import("exceljs")).default;
    const wb = new ExcelJSMod.Workbook();
    await wb.xlsx.load(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    );
    const ws = wb.getWorksheet("1차")!;
    // Column D = 4 (번호); should have yellow fill
    const headerCell = ws.getCell(1, 4);
    const fill = headerCell.fill as { type?: string; pattern?: string; fgColor?: { argb?: string } } | undefined;
    expect(fill?.type).toBe("pattern");
    expect(fill?.pattern).toBe("solid");
    expect(fill?.fgColor?.argb?.toUpperCase()).toMatch(/F{0,2}FFFF00/);
  });
});

// ---------------------------------------------------------------------------
// generateNaverUploadExcel
// ---------------------------------------------------------------------------

const sampleNaverItems: NaverUploadInput[] = [
  { productOrderId: "NAV-001", trackingNumber: "1234567890" },
  { productOrderId: "NAV-002", trackingNumber: "0987654321" },
];

describe("generateNaverUploadExcel", () => {
  const NAVER_HEADERS = ["상품주문번호", "배송방법", "택배사", "송장번호"];

  it("returns a Buffer", () => {
    const result = generateNaverUploadExcel(sampleNaverItems);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("sheet name is exactly '발송처리'", () => {
    const buf = generateNaverUploadExcel(sampleNaverItems);
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames).toContain("발송처리");
  });

  it("has correct headers", () => {
    const buf = generateNaverUploadExcel(sampleNaverItems);
    const rows = readSheet(buf, "발송처리");
    expect(rows[0]).toEqual(NAVER_HEADERS);
  });

  it("배송방법 is always '택배발송 : 택배,등기,소포'", () => {
    const buf = generateNaverUploadExcel(sampleNaverItems);
    const rows = readSheet(buf, "발송처리");
    expect(rows[1][1]).toBe("택배발송 : 택배,등기,소포");
    expect(rows[2][1]).toBe("택배발송 : 택배,등기,소포");
  });

  it("defaults 택배사 to 'CJ대한통운'", () => {
    const buf = generateNaverUploadExcel(sampleNaverItems);
    const rows = readSheet(buf, "발송처리");
    expect(rows[1][2]).toBe("CJ대한통운");
    expect(rows[2][2]).toBe("CJ대한통운");
  });

  it("accepts custom carrier", () => {
    const buf = generateNaverUploadExcel(sampleNaverItems, "우체국택배");
    const rows = readSheet(buf, "발송처리");
    expect(rows[1][2]).toBe("우체국택배");
  });

  it("maps productOrderId and trackingNumber correctly", () => {
    const buf = generateNaverUploadExcel(sampleNaverItems);
    const rows = readSheet(buf, "발송처리");
    expect(rows[1][0]).toBe("NAV-001");
    expect(rows[1][3]).toBe("1234567890");
    expect(rows[2][0]).toBe("NAV-002");
    expect(rows[2][3]).toBe("0987654321");
  });

  it("produces only header row for empty list", () => {
    const buf = generateNaverUploadExcel([]);
    const rows = readSheet(buf, "발송처리");
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual(NAVER_HEADERS);
  });

  it("uses xls bookType (Naver requires .xls)", () => {
    const buf = generateNaverUploadExcel(sampleNaverItems);
    // XLS files start with D0 CF 11 E0 (OLE2 compound document magic bytes)
    expect(buf[0]).toBe(0xd0);
    expect(buf[1]).toBe(0xcf);
    expect(buf[2]).toBe(0x11);
    expect(buf[3]).toBe(0xe0);
  });
});
