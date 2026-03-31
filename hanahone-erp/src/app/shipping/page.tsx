import { prisma } from "@/lib/prisma";
import { NaverShippingManager } from "@/components/shipping/NaverShippingManager";

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
        <h1 className="text-xl font-bold tracking-tight">Naver 배송 관리</h1>
        <p className="text-sm text-[var(--text-secondary)]">회사를 선택해주세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight">Naver 배송 관리</h1>
      <NaverShippingManager companyId={companyId} />
    </div>
  );
}
