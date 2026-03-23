import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";

const formatWon = (n: number) => `₩${n.toLocaleString()}`;

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
      key: "sku",
      header: "SKU",
      render: (row: (typeof products)[0]) => (
        <Link href={`/products/${row.id}`} className="font-semibold text-accent hover:underline">
          {row.sku}
        </Link>
      ),
    },
    {
      key: "name",
      header: "Name",
      render: (row: (typeof products)[0]) => (
        <span className="font-semibold">{row.name}</span>
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
        <span className="font-semibold">{formatWon(Number(row.basePrice))}</span>
      ),
    },
    {
      key: "costPrice",
      header: "Cost Price",
      align: "right" as const,
      render: (row: (typeof products)[0]) => (
        <span className="text-[var(--text-secondary)]">{formatWon(Number(row.costPrice))}</span>
      ),
    },
    {
      key: "company",
      header: "Company",
      render: (row: (typeof products)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.company.name}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight">Products</h1>
      <Card>
        {products.length === 0 ? (
          <EmptyState title="No products" description="No products found for the selected company." />
        ) : (
          <DataTable columns={columns} data={products} />
        )}
      </Card>
    </div>
  );
}
