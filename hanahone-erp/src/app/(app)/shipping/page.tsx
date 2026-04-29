import { prisma } from "@/lib/prisma";
import { ShippingTabs } from "@/components/shipping/ShippingTabs";

export default async function ShippingPage({
  searchParams,
}: {
  searchParams: { company?: string; tab?: string };
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

  const initialTab = searchParams.tab === "inbound" ? "inbound" : "outbound";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">배송 관리</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">고객 발송 + 로켓그로스 입고 통합</p>
      </div>
      <ShippingTabs companyId={companyId} initialTab={initialTab} />
    </div>
  );
}
