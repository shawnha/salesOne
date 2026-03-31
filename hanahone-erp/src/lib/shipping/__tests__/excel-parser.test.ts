import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseTrackingExcel } from "../excel-parser";

const HEADERS = [
  "보내는분", "보내는분 연락처", "주소 ", "번호", "수취인명",
  "상품명", "수량", "핸드폰", "기타연락처", "주소",
  "배송메세지", "(공란)", "상품고유코드", "배송방식", "운송장번호",
  "택배사", "productOrderId", "batchId",
];

function createTestExcel(rows: (string | number | undefined)[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "1차");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

describe("parseTrackingExcel", () => {
  it("parses a single tracking number from column O", () => {
    const rows = [
      HEADERS,
      // D(3)=번호, E(4)=수취인명, H(7)=핸드폰, O(14)=운송장번호, Q(16)=productOrderId, R(17)=batchId
      ["sender", "010-0000-0000", "addr", 1, "홍길동", "상품A", 1, "010-1234-5678", "", "addr2", "msg", "", "code", "direct", "1234567890", "CJ대한통운", "ORDER-001", "BATCH-2026-03"],
    ];
    const buffer = createTestExcel(rows);
    const result = parseTrackingExcel(buffer);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].trackingNumber).toBe("1234567890");
    expect(result.rows[0].productOrderId).toBe("ORDER-001");
    expect(result.rows[0].rowNumber).toBe(1);
    expect(result.rows[0].recipientName).toBe("홍길동");
    expect(result.rows[0].recipientPhone).toBe("010-1234-5678");
  });

  it("parses multiple rows", () => {
    const rows = [
      HEADERS,
      ["sender", "010-0000-0000", "addr", 1, "홍길동", "상품A", 1, "010-1234-5678", "", "addr2", "msg", "", "code", "direct", "1111111111", "CJ", "ORDER-001", "BATCH-A"],
      ["sender", "010-0000-0000", "addr", 2, "김철수", "상품B", 1, "010-9999-9999", "", "addr2", "msg", "", "code", "direct", "2222222222", "CJ", "ORDER-002", "BATCH-A"],
    ];
    const buffer = createTestExcel(rows);
    const result = parseTrackingExcel(buffer);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].productOrderId).toBe("ORDER-001");
    expect(result.rows[1].productOrderId).toBe("ORDER-002");
    expect(result.rows[0].rowNumber).toBe(1);
    expect(result.rows[1].rowNumber).toBe(2);
  });

  it("skips rows without a tracking number", () => {
    const rows = [
      HEADERS,
      ["sender", "", "addr", 1, "홍길동", "상품A", 1, "010-1234-5678", "", "addr2", "msg", "", "code", "direct", "", "CJ", "ORDER-001", "BATCH-A"],
      ["sender", "", "addr", 2, "김철수", "상품B", 1, "010-9999-9999", "", "addr2", "msg", "", "code", "direct", "9999999999", "CJ", "ORDER-002", "BATCH-A"],
    ];
    const buffer = createTestExcel(rows);
    const result = parseTrackingExcel(buffer);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].productOrderId).toBe("ORDER-002");
  });

  it("extracts batchId from the first data row", () => {
    const rows = [
      HEADERS,
      ["sender", "", "addr", 1, "홍길동", "상품A", 1, "010-1234-5678", "", "addr2", "msg", "", "code", "direct", "1234567890", "CJ", "ORDER-001", "BATCH-2026-03"],
      ["sender", "", "addr", 2, "김철수", "상품B", 1, "010-9999-9999", "", "addr2", "msg", "", "code", "direct", "9999999999", "CJ", "ORDER-002", "BATCH-2026-03"],
    ];
    const buffer = createTestExcel(rows);
    const result = parseTrackingExcel(buffer);

    expect(result.batchId).toBe("BATCH-2026-03");
  });

  it("returns null batchId for headers-only file", () => {
    const rows = [HEADERS];
    const buffer = createTestExcel(rows);
    const result = parseTrackingExcel(buffer);

    expect(result.batchId).toBeNull();
    expect(result.rows).toHaveLength(0);
  });

  it("returns empty rows for headers-only file", () => {
    const rows = [HEADERS];
    const buffer = createTestExcel(rows);
    const result = parseTrackingExcel(buffer);

    expect(result.rows).toHaveLength(0);
  });

  it("converts numeric tracking numbers to string", () => {
    const rows = [
      HEADERS,
      ["sender", "", "addr", 1, "홍길동", "상품A", 1, "010-1234-5678", "", "addr2", "msg", "", "code", "direct", 1234567890, "CJ", "ORDER-001", "BATCH-A"],
    ];
    const buffer = createTestExcel(rows);
    const result = parseTrackingExcel(buffer);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].trackingNumber).toBe("1234567890");
    expect(typeof result.rows[0].trackingNumber).toBe("string");
  });

  it("falls back to row index when D column (번호) is missing", () => {
    const rows = [
      HEADERS,
      // D column (index 3) is undefined
      ["sender", "", "addr", undefined, "홍길동", "상품A", 1, "010-1234-5678", "", "addr2", "msg", "", "code", "direct", "5555555555", "CJ", "ORDER-001", "BATCH-A"],
    ];
    const buffer = createTestExcel(rows);
    const result = parseTrackingExcel(buffer);

    // Row index 1 (0=header, 1=first data row)
    expect(result.rows[0].rowNumber).toBe(1);
  });
});
