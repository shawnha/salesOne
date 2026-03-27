import { prisma } from "@/lib/prisma";
import { CgetcInventoryTable } from "@/components/inventory/cgetc-inventory-table";
import Link from "next/link";

export default async function CgetcInventoryPage() {
  const hoiCompany = await prisma.company.findFirst({
    where: { name: "HOI" },
    select: { id: true, name: true },
  });

  if (!hoiCompany) {
    return <p className="text-sm text-[var(--text-tertiary)]">HOI company not found</p>;
  }

  const lastSync = await prisma.syncJob.findFirst({
    where: { platform: "CGETC", status: "SUCCESS" },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  });

  const totalExternal = await prisma.externalInventory.count({
    where: { companyId: hoiCompany.id, platform: "CGETC" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/inventory"
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm"
          >
            &larr; Inventory
          </Link>
          <h1 className="text-xl font-bold tracking-tight">CGETC 3PL Inventory</h1>
        </div>
        <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
          {lastSync?.completedAt && (
            <span>
              Last sync: {new Date(lastSync.completedAt).toLocaleString("en-US")}
            </span>
          )}
          <span>{totalExternal.toLocaleString()} SKUs synced</span>
        </div>
      </div>

      <CgetcInventoryTable companyId={hoiCompany.id} />
    </div>
  );
}
