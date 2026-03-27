import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/table";
import { notFound } from "next/navigation";
import Link from "next/link";

const formatWon = (n: number) => `₩${n.toLocaleString()}`;

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const customer = await prisma.customer.findUnique({
    where: { id: params.id },
    include: {
      company: { select: { name: true } },
      orders: {
        include: { company: { select: { name: true } } },
        orderBy: { orderDate: "desc" },
        take: 50,
      },
    },
  });

  if (!customer) return notFound();

  const contactInfo = customer.contactInfo as Record<string, string> | null;

  const orderColumns = [
    {
      key: "orderNumber",
      header: "Order #",
      render: (row: (typeof customer.orders)[0]) => (
        <Link href={`/orders/${row.id}`} className="font-semibold text-accent hover:underline">
          {row.orderNumber}
        </Link>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (row: (typeof customer.orders)[0]) => <Badge status={row.type} />,
    },
    {
      key: "status",
      header: "Status",
      render: (row: (typeof customer.orders)[0]) => <Badge status={row.fulfillmentStatus} />,
    },
    {
      key: "totalAmount",
      header: "Amount",
      align: "right" as const,
      render: (row: (typeof customer.orders)[0]) => (
        <span className="font-semibold">{formatWon(Number(row.totalAmount))}</span>
      ),
    },
    {
      key: "orderDate",
      header: "Date",
      render: (row: (typeof customer.orders)[0]) => (
        <span className="text-[var(--text-secondary)]">
          {new Date(row.orderDate).toLocaleDateString("ko-KR")}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/customers" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm">
          &larr; Customers
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{customer.name}</h1>
        <Badge status={customer.type} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <h2 className="text-sm font-bold mb-4">Contact Information</h2>
          <div className="space-y-3 text-[13px]">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Company</span>
              <span className="font-semibold">{customer.company.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Type</span>
              <Badge status={customer.type} />
            </div>
            {contactInfo && Object.entries(contactInfo).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="text-[var(--text-secondary)] capitalize">{key}</span>
                <span className="font-semibold">{value}</span>
              </div>
            ))}
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Since</span>
              <span className="font-semibold">{new Date(customer.createdAt).toLocaleDateString("ko-KR")}</span>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-bold mb-4">Summary</h2>
          <div className="space-y-3 text-[13px]">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Total Orders</span>
              <span className="font-semibold">{customer.orders.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Total Revenue</span>
              <span className="font-semibold">
                {formatWon(customer.orders.reduce((sum, o) => sum + Number(o.totalAmount), 0))}
              </span>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-bold mb-4">Order History</h2>
        {customer.orders.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">No orders yet.</p>
        ) : (
          <DataTable columns={orderColumns} data={customer.orders} />
        )}
      </Card>
    </div>
  );
}
