import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductEditButton, ProductDeleteButton } from "@/components/products/product-actions";

const formatPrice = (n: number) => n === 0 ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  const where = searchParams.company ? { companyId: searchParams.company } : {};

  const products = await prisma.product.findMany({
    where,
    include: { company: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (row: (typeof products)[0]) => (
        <span className="font-semibold">{row.name}</span>
      ),
    },
    {
      key: "sku",
      header: "SKU",
      render: (row: (typeof products)[0]) => (
        <span className="text-[var(--text-secondary)] font-mono text-xs">{row.sku}</span>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (row: (typeof products)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.category}</span>
      ),
    },
    {
      key: "basePrice",
      header: "Base Price",
      align: "right" as const,
      render: (row: (typeof products)[0]) => (
        <span className="font-semibold">{formatPrice(Number(row.basePrice))}</span>
      ),
    },
    {
      key: "costPrice",
      header: "Cost Price",
      align: "right" as const,
      render: (row: (typeof products)[0]) => (
        <span className="text-[var(--text-secondary)]">{formatPrice(Number(row.costPrice))}</span>
      ),
    },
    {
      key: "company",
      header: "Company",
      render: (row: (typeof products)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.company.name}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right" as const,
      render: (row: (typeof products)[0]) => (
        <div className="flex items-center gap-1 justify-end">
          <ProductEditButton product={{
            id: row.id,
            name: row.name,
            sku: row.sku,
            description: row.description,
            category: row.category,
            basePrice: Number(row.basePrice),
            costPrice: Number(row.costPrice),
            companyId: row.companyId,
          }} />
          <ProductDeleteButton product={{
            id: row.id,
            name: row.name,
            sku: row.sku,
            description: row.description,
            category: row.category,
            basePrice: Number(row.basePrice),
            costPrice: Number(row.costPrice),
            companyId: row.companyId,
          }} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Products</h1>
        <span className="text-xs text-[var(--text-tertiary)]">{products.length} products</span>
      </div>
      <Card>
        {products.length === 0 ? (
          <EmptyState title="No products" description="No products found." />
        ) : (
          <DataTable columns={columns} data={products} />
        )}
      </Card>
    </div>
  );
}
