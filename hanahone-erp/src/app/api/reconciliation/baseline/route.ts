import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

// GET: Fetch current baselines for a company
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const { error } = await requireCompanyAccess(companyId);
  if (error) return error;

  const baselines = await prisma.inventoryBaseline.findMany({
    where: { companyId },
    orderBy: { sku: "asc" },
  });

  return NextResponse.json(baselines);
}

// POST: Set baselines from an uploaded Excel snapshot.
// Multipart form fields:
//   companyId: UUID
//   baselineDate: ISO date string (required — the "as of" date this snapshot represents)
//   file: .xlsx with columns "Internal Reference" (SKU) + "Quantity On Hand"
//   mode: "replace" | "upsert" (default: "upsert")
// Auto-fetching from CGETC was removed deliberately — baselines must be explicit
// opening balances, not a live snapshot that gets clobbered by each sale.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const companyId = String(form.get("companyId") || "");
  const baselineDateStr = String(form.get("baselineDate") || "");
  const mode = String(form.get("mode") || "upsert");
  const file = form.get("file");

  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });
  if (!baselineDateStr) {
    return NextResponse.json({ error: "baselineDate required (ISO date, e.g. 2026-02-01)" }, { status: 400 });
  }
  const baselineDate = new Date(baselineDateStr);
  if (isNaN(baselineDate.getTime())) {
    return NextResponse.json({ error: "Invalid baselineDate" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required (Excel .xlsx with Internal Reference + Quantity On Hand columns)" }, { status: 400 });
  }

  const { error, session } = await requireCompanyAccess(companyId);
  if (error) return error;

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  if (!firstSheet) {
    return NextResponse.json({ error: "Excel file has no sheets" }, { status: 400 });
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { defval: null });

  type Parsed = { sku: string; name: string; quantity: number };
  const parsed: Parsed[] = [];
  const errors: string[] = [];

  const skuKeys = ["Internal Reference", "SKU", "sku", "Sku"];
  const nameKeys = ["Name", "Product Name", "name", "상품명"];
  const qtyKeys = ["Quantity On Hand", "Quantity", "quantity", "On Hand", "재고"];

  const pick = (row: Record<string, any>, keys: string[]) => {
    for (const k of keys) if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    return null;
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sku = pick(row, skuKeys);
    const qtyRaw = pick(row, qtyKeys);
    const name = pick(row, nameKeys) || sku || "";

    if (!sku) { errors.push(`Row ${i + 2}: missing SKU`); continue; }
    const qty = Number(qtyRaw);
    if (!Number.isFinite(qty) || qty < 0) {
      errors.push(`Row ${i + 2} (${sku}): invalid quantity "${qtyRaw}"`);
      continue;
    }
    parsed.push({ sku: String(sku).trim(), name: String(name).trim(), quantity: Math.round(qty) });
  }

  if (parsed.length === 0) {
    return NextResponse.json({ error: "No valid rows parsed", details: errors }, { status: 400 });
  }

  const userId = (session as any).user?.id || "system";

  if (mode === "replace") {
    await prisma.$transaction([
      prisma.inventoryBaseline.deleteMany({ where: { companyId } }),
      ...parsed.map((p) =>
        prisma.inventoryBaseline.create({
          data: {
            companyId,
            sku: p.sku,
            productName: p.name,
            quantity: p.quantity,
            setAt: baselineDate,
            setBy: userId,
          },
        })
      ),
    ]);
  } else {
    await prisma.$transaction(
      parsed.map((p) =>
        prisma.inventoryBaseline.upsert({
          where: { companyId_sku: { companyId, sku: p.sku } },
          update: {
            productName: p.name,
            quantity: p.quantity,
            setAt: baselineDate,
            setBy: userId,
          },
          create: {
            companyId,
            sku: p.sku,
            productName: p.name,
            quantity: p.quantity,
            setAt: baselineDate,
            setBy: userId,
          },
        })
      )
    );
  }

  return NextResponse.json(
    {
      count: parsed.length,
      baselineDate: baselineDate.toISOString(),
      mode,
      warnings: errors.length ? errors : undefined,
    },
    { status: 201 }
  );
}
