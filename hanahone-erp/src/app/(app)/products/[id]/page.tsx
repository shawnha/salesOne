import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";
import Link from "next/link";

const formatWon = (n: number) => `₩${n.toLocaleString()}`;

export default async function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: {
      company: { select: { name: true } },
      inventories: {
        include: { company: { select: { name: true } } },
      },
    },
  });

  if (!product) return notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/products" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm">
          &larr; Products
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{product.name}</h1>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <h2 className="text-sm font-bold mb-4">Product Details</h2>
          <form className="space-y-4">
            <Input label="Name" name="name" defaultValue={product.name} />
            <Input label="SKU" name="sku" defaultValue={product.sku} />
            <Input label="Category" name="category" defaultValue={product.category} />
            <Input label="Description" name="description" defaultValue={product.description ?? ""} />
            <Input label="Base Price (₩)" name="basePrice" type="number" defaultValue={Number(product.basePrice)} />
            <Input label="Cost Price (₩)" name="costPrice" type="number" defaultValue={Number(product.costPrice)} />
            <div className="pt-2">
              <Button type="submit" variant="primary" size="sm">
                Save Changes
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <h2 className="text-sm font-bold mb-4">Product Information</h2>
          <div className="space-y-3 text-[13px]">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Company</span>
              <span className="font-semibold">{product.company.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Base Price</span>
              <span className="font-semibold">{formatWon(Number(product.basePrice))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Cost Price</span>
              <span className="font-semibold">{formatWon(Number(product.costPrice))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Margin</span>
              <span className="font-semibold">
                {formatWon(Number(product.basePrice) - Number(product.costPrice))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Created</span>
              <span className="font-semibold">{new Date(product.createdAt).toLocaleDateString("ko-KR")}</span>
            </div>
          </div>

          {product.inventories.length > 0 && (
            <div className="mt-6 pt-4 border-t border-[var(--border)]">
              <h3 className="text-sm font-bold mb-3">Inventory</h3>
              <div className="space-y-2 text-[13px]">
                {product.inventories.map((inv) => (
                  <div key={inv.id} className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">
                      {inv.warehouseLocation} ({inv.company.name})
                    </span>
                    <span className={`font-semibold ${inv.quantity <= inv.reorderLevel ? "text-rose-500" : ""}`}>
                      {inv.quantity} units
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
