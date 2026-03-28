import { prisma } from "@/lib/prisma";
import { ProductsTable } from "@/components/products/products-table";

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

  const mapped = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    description: p.description,
    category: p.category,
    basePrice: Number(p.basePrice),
    costPrice: Number(p.costPrice),
    companyId: p.companyId,
    companyName: p.company.name,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Products</h1>
        <span className="text-xs text-[var(--text-tertiary)]">{products.length} products</span>
      </div>
      <ProductsTable products={mapped} />
    </div>
  );
}
