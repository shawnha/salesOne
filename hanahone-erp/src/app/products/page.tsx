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
    include: { company: { select: { id: true, name: true } } },
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

  // Group view: separate sections per company
  const isGroupView = !searchParams.company;
  const companyGroups = isGroupView
    ? Array.from(
        mapped.reduce((map, p) => {
          const group = map.get(p.companyId) || { name: p.companyName, products: [] };
          group.products.push(p);
          map.set(p.companyId, group);
          return map;
        }, new Map<string, { name: string; products: typeof mapped }>())
      ).sort(([, a], [, b]) => a.name.localeCompare(b.name))
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Products</h1>
        <span className="text-xs text-[var(--text-tertiary)]">{products.length} products</span>
      </div>
      {companyGroups ? (
        companyGroups.map(([companyId, group]) => (
          <div key={companyId} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
              {group.name} <span className="text-[var(--text-quaternary)]">({group.products.length})</span>
            </h2>
            <ProductsTable products={group.products} />
          </div>
        ))
      ) : (
        <ProductsTable products={mapped} />
      )}
    </div>
  );
}
