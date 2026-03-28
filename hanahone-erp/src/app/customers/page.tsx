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
    include: { company: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const data = customers.map((c) => {
    const info = c.contactInfo as Record<string, string> | null;
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      email: info?.email || null,
      phone: info?.phone || null,
      companyName: c.company.name,
    };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight">Customers</h1>
      <CustomersTable customers={data} />
    </div>
  );
}
