import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const GONGGU_EXTERNAL_SKUS = [
  "13269224598", "13269992041", "13269992042", "13269992043", "13269992044",
];

async function main() {
  const result = await prisma.skuMapping.updateMany({
    where: {
      platform: "NAVER",
      externalSku: { in: GONGGU_EXTERNAL_SKUS },
    },
    data: { isGonggu: true },
  });
  console.log(`Updated ${result.count} SkuMapping records to isGonggu=true`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
