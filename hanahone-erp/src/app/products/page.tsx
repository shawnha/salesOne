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

  const isGroupView = !searchParams.company;

  // Group view: company → source sections inside each company
  // Company view: source sections only
  type ProductRow = typeof mapped[number];

  function groupBySource(items: ProductRow[]) {
    const sourceMap = new Map<string, ProductRow[]>();
    for (const p of items) {
      const source = p.category || "Other";
      const group = sourceMap.get(source) || [];
      group.push(p);
      sourceMap.set(source, group);
    }
    return Array.from(sourceMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  }

  if (isGroupView) {
    // Group by company first, then by source within each company
    const companyMap = new Map<string, { name: string; products: ProductRow[] }>();
    for (const p of mapped) {
      const group = companyMap.get(p.companyId) || { name: p.companyName, products: [] };
      group.products.push(p);
      companyMap.set(p.companyId, group);
    }
    const companyGroups = Array.from(companyMap.entries()).sort(([, a], [, b]) => a.name.localeCompare(b.name));

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Products</h1>
          <span className="text-xs text-[var(--text-tertiary)]">{products.length} products</span>
        </div>
        {companyGroups.map(([companyId, group]) => {
          const sourceGroups = groupBySource(group.products);
          return (
            <div key={companyId} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                {group.name} <span className="text-[var(--text-quaternary)]">({group.products.length})</span>
              </h2>
              <ProductsTable products={group.products} sourceGroups={sourceGroups} />
            </div>
          );
        })}
      </div>
    );
  }

  // Company view: group by source
  const sourceGroups = groupBySource(mapped);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Products</h1>
        <span className="text-xs text-[var(--text-tertiary)]">{products.length} products</span>
      </div>
      {sourceGroups.map(([source, items]) => (
        <div key={source} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            {source} <span className="text-[var(--text-quaternary)]">({items.length})</span>
          </h2>
          <ProductsTable products={items} />
        </div>
      ))}
    </div>
  );
}
