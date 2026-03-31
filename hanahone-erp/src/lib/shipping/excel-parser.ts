import * as XLSX from "xlsx";

export interface ParsedTrackingRow {
  rowNumber: number;
  productOrderId: string;
  trackingNumber: string;
  recipientName?: string;
  recipientPhone?: string;
}

export interface ParsedTrackingResult {
  batchId: string | null;
  rows: ParsedTrackingRow[];
}

// Column indices (0-based)
const COL_ROW_NUMBER = 3;    // D: 번호
const COL_RECIPIENT_NAME = 4; // E: 수취인명
const COL_PHONE = 7;          // H: 핸드폰
const COL_TRACKING = 14;      // O: 운송장번호
const COL_ORDER_ID = 16;      // Q: productOrderId
const COL_BATCH_ID = 17;      // R: batchId

export function parseTrackingExcel(buffer: Buffer): ParsedTrackingResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // Convert to array of arrays; defval ensures missing cells come back as undefined
  const rawRows = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(ws, {
    header: 1,
    defval: undefined,
  });

  // Skip header row (index 0)
  const dataRows = rawRows.slice(1);

  if (dataRows.length === 0) {
    return { batchId: null, rows: [] };
  }

  // Extract batchId from first data row
  const firstRow = dataRows[0] as (string | number | undefined)[];
  const rawBatchId = firstRow[COL_BATCH_ID];
  const batchId = rawBatchId != null ? String(rawBatchId) : null;

  const rows: ParsedTrackingRow[] = [];

  dataRows.forEach((rawRow, index) => {
    const row = rawRow as (string | number | undefined)[];

    const rawTracking = row[COL_TRACKING];

    // Skip rows without a tracking number
    if (rawTracking == null || rawTracking === "") {
      return;
    }

    const trackingNumber = String(rawTracking);

    const rawRowNumber = row[COL_ROW_NUMBER];
    const rowNumber =
      rawRowNumber != null && rawRowNumber !== ""
        ? Number(rawRowNumber)
        : index + 1; // fallback: 1-based index relative to data rows

    const rawOrderId = row[COL_ORDER_ID];
    const productOrderId = rawOrderId != null ? String(rawOrderId) : "";

    const rawName = row[COL_RECIPIENT_NAME];
    const recipientName = rawName != null && rawName !== "" ? String(rawName) : undefined;

    const rawPhone = row[COL_PHONE];
    const recipientPhone = rawPhone != null && rawPhone !== "" ? String(rawPhone) : undefined;

    rows.push({
      rowNumber,
      productOrderId,
      trackingNumber,
      recipientName,
      recipientPhone,
    });
  });

  return { batchId, rows };
}
