import { prisma } from "@/lib/prisma";
import { UnifiedShippingManager } from "@/components/shipping/UnifiedShippingManager";

export default async function ShippingPage({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  let companyId = searchParams.company;

  if (!companyId) {
    const hok = await prisma.company.findFirst({
      where: { name: { contains: "HOK" } },
      select: { id: true },
    });
    companyId = hok?.id;
  }

  if (!companyId) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold tracking-tight">배송 관리</h1>
        <p className="text-sm text-[var(--text-secondary)]">회사를 선택해주세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">배송 관리</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">네이버 + 쿠팡 통합 발주 → 송장 → dispatch</p>
      </div>
      <UnifiedShippingManager companyId={companyId} />
    </div>
  );
}
