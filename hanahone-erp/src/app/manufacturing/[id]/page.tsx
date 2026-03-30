import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/table";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ProductionStatusChanger } from "@/components/manufacturing/ProductionStatusChanger";

const formatWon = (n: number) => `₩${n.toLocaleString()}`;

export default async function ProductionOrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const productionOrder = await prisma.productionOrder.findUnique({
    where: { id: params.id },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          basePrice: true,
          costPrice: true,
        },
      },
      company: { select: { name: true } },
    },
  });

  if (!productionOrder) return notFound();

  const bom = await prisma.billOfMaterials.findMany({
    where: {
      finishedProductId: productionOrder.productId,
      companyId: productionOrder.companyId,
    },
    include: {
      rawMaterial: { select: { name: true, sku: true, costPrice: true } },
    },
  });

  const statusTransitions: Record<string, string[]> = {
    PLANNED: ["IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  };

  const nextStatuses = statusTransitions[productionOrder.status] ?? [];

  const progressPercent =
    productionOrder.quantityToProduce > 0
      ? Math.round((productionOrder.quantityProduced / productionOrder.quantityToProduce) * 100)
      : 0;

  const bomColumns = [
    {
      key: "material",
      header: "Raw Material",
      render: (row: (typeof bom)[0]) => (
        <span className="font-semibold">{row.rawMaterial.name}</span>
      ),
    },
    {
      key: "sku",
      header: "SKU",
      render: (row: (typeof bom)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.rawMaterial.sku}</span>
      ),
    },
    {
      key: "qtyRequired",
      header: "Qty Required",
      align: "right" as const,
      render: (row: (typeof bom)[0]) => (
        <span className="font-semibold">{Number(row.quantityRequired)}</span>
      ),
    },
    {
      key: "totalNeeded",
      header: "Total Needed",
      align: "right" as const,
      render: (row: (typeof bom)[0]) => (
        <span className="font-semibold">
          {Number(row.quantityRequired) * productionOrder.quantityToProduce}
        </span>
      ),
    },
    {
      key: "unitCost",
      header: "Unit Cost",
      align: "right" as const,
      render: (row: (typeof bom)[0]) => (
        <span className="text-[var(--text-secondary)]">{formatWon(Number(row.rawMaterial.costPrice))}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/manufacturing" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm">
          &larr; Manufacturing
        </Link>
        <h1 className="text-xl font-bold tracking-tight">
          Production: {productionOrder.product.name}
        </h1>
        <Badge status={productionOrder.status} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <h2 className="text-sm font-bold mb-4">Production Details</h2>
          <div className="space-y-3 text-[13px]">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Product</span>
              <span className="font-semibold">{productionOrder.product.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">SKU</span>
              <span className="font-semibold">{productionOrder.product.sku}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Company</span>
              <span className="font-semibold">{productionOrder.company.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Quantity to Produce</span>
              <span className="font-semibold">{productionOrder.quantityToProduce}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Quantity Produced</span>
              <span className="font-semibold">{productionOrder.quantityProduced}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Start Date</span>
              <span className="font-semibold">{new Date(productionOrder.startDate).toLocaleDateString("ko-KR")}</span>
            </div>
            {productionOrder.endDate && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">End Date</span>
                <span className="font-semibold">{new Date(productionOrder.endDate).toLocaleDateString("ko-KR")}</span>
              </div>
            )}
            {productionOrder.notes && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Notes</span>
                <span className="font-semibold">{productionOrder.notes}</span>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-bold mb-4">Progress</h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-[13px] mb-2">
                <span className="text-[var(--text-secondary)]">Completion</span>
                <span className="font-semibold">{progressPercent}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-[var(--border)]">
                <div
                  className="h-2 rounded-full bg-accent transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                {productionOrder.quantityProduced} of {productionOrder.quantityToProduce} units
              </p>
            </div>

            <div className="pt-4 border-t border-[var(--border)]">
              <h3 className="text-sm font-bold mb-3">Status Management</h3>
              <p className="text-[13px] text-[var(--text-secondary)] mb-3">
                Current status: <Badge status={productionOrder.status} />
              </p>
              <ProductionStatusChanger
                orderId={productionOrder.id}
                status={productionOrder.status}
                quantityToProduce={productionOrder.quantityToProduce}
              />
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-bold mb-4">Bill of Materials</h2>
        {bom.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">No BOM defined for this product.</p>
        ) : (
          <DataTable columns={bomColumns} data={bom} />
        )}
      </Card>
    </div>
  );
}
