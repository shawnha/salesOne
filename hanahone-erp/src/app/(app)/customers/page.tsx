import { prisma } from "@/lib/prisma";
import { CustomersTable } from "@/components/customers/customers-table";
import { SearchInput } from "@/components/ui/search-input";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { company?: string; q?: string };
}) {
  const where: any = searchParams.company ? { companyId: searchParams.company } : {};
  if (searchParams.q) {
    where.OR = [
      { name: { contains: searchParams.q, mode: "insensitive" } },
      { email: { contains: searchParams.q, mode: "insensitive" } },
    ];
  }

  const customers = await prisma.customer.findMany({
    where,
    include: { company: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  // Per-customer channel set: derived from each customer's order externalSource.
  // Customers with zero orders or only manual orders end up with [] (rendered as 직접).
  const customerOrderRows = await prisma.order.findMany({
    where: {
      ...(searchParams.company ? { companyId: searchParams.company } : {}),
      customerId: { not: null },
    },
    select: { customerId: true, externalSource: true },
  });
  const channelsByCustomer = new Map<string, Set<string>>();
  for (const o of customerOrderRows) {
    if (!o.customerId) continue;
    if (!channelsByCustomer.has(o.customerId)) channelsByCustomer.set(o.customerId, new Set());
    if (o.externalSource) channelsByCustomer.get(o.customerId)!.add(o.externalSource);
  }

  const data = customers.map((c) => {
    const info = c.contactInfo as Record<string, string> | null;
    const channels = Array.from(channelsByCustomer.get(c.id) ?? new Set<string>()).sort();
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      email: c.email || info?.email || null,
      phone: info?.phone || null,
      recipientName: info?.recipientName && info.recipientName !== c.name ? info.recipientName : null,
      companyId: c.companyId,
      companyName: c.company.name,
      channels,
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
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold tracking-tight">고객</h1>
        <SearchInput placeholder="이름 또는 이메일..." />
      </div>
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
