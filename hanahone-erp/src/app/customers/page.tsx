import { prisma } from "@/lib/prisma";
import { CustomersTable } from "@/components/customers/customers-table";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  const where = searchParams.company ? { companyId: searchParams.company } : {};

  const customers = await prisma.customer.findMany({
    where,
    include: { company: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  const data = customers.map((c) => {
    const info = c.contactInfo as Record<string, string> | null;
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      email: c.email || info?.email || null,
      phone: info?.phone || null,
      companyId: c.companyId,
      companyName: c.company.name,
    };
  });

  // Group view: separate sections per company
  const isGroupView = !searchParams.company;
  const companyGroups = isGroupView
    ? Array.from(
        data.reduce((map, c) => {
          const group = map.get(c.companyId) || { name: c.companyName, customers: [] };
          group.customers.push(c);
          map.set(c.companyId, group);
          return map;
        }, new Map<string, { name: string; customers: typeof data }>())
      ).sort(([, a], [, b]) => a.name.localeCompare(b.name))
    : null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight">Customers</h1>
      {companyGroups ? (
        companyGroups.map(([companyId, group]) => (
          <div key={companyId} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
              {group.name} <span className="text-[var(--text-quaternary)]">({group.customers.length})</span>
            </h2>
            <CustomersTable
              customers={group.customers}
              companyId={companyId}
              companyName={group.name}
            />
          </div>
        ))
      ) : (
        <CustomersTable
          customers={data}
          companyId={searchParams.company}
          companyName={data[0]?.companyName}
        />
      )}
    </div>
  );
}
