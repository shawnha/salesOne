import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  const where = searchParams.company ? { companyId: searchParams.company } : {};

  const customers = await prisma.customer.findMany({
    where,
    include: { company: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (row: (typeof customers)[0]) => (
        <Link href={`/customers/${row.id}`} className="font-semibold text-accent hover:underline">
          {row.name}
        </Link>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (row: (typeof customers)[0]) => <Badge status={row.type} />,
    },
    {
      key: "contact",
      header: "Contact",
      render: (row: (typeof customers)[0]) => {
        const info = row.contactInfo as Record<string, string> | null;
        return (
          <span className="text-[var(--text-secondary)]">
            {info?.email || info?.phone || "—"}
          </span>
        );
      },
    },
    {
      key: "company",
      header: "Company",
      render: (row: (typeof customers)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.company.name}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight">Customers</h1>
      <Card>
        {customers.length === 0 ? (
          <EmptyState title="No customers" description="No customers found for the selected company." />
        ) : (
          <DataTable columns={columns} data={customers} />
        )}
      </Card>
    </div>
  );
}
