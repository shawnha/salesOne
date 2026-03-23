import "dotenv/config";
import { PrismaClient, CompanyType, UserRole, CustomerType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function main() {
  // Companies
  const hoi = await prisma.company.create({
    data: { name: "HOI", type: CompanyType.MOTHER },
  });
  const hok = await prisma.company.create({
    data: { name: "HOK", type: CompanyType.SUBSIDIARY, parentCompanyId: hoi.id },
  });
  const hor = await prisma.company.create({
    data: { name: "HOR", type: CompanyType.SUBSIDIARY, parentCompanyId: hok.id },
  });

  // Users
  const adminPw = await hashPassword("admin123");
  const managerPw = await hashPassword("manager123");
  const staffPw = await hashPassword("staff123");

  await prisma.user.createMany({
    data: [
      { name: "Admin User", email: "admin@hanahone.com", password: adminPw, role: UserRole.ADMIN, companyId: hoi.id },
      { name: "HOI Manager", email: "manager@hoi.com", password: managerPw, role: UserRole.MANAGER, companyId: hoi.id },
      { name: "HOK Manager", email: "manager@hok.com", password: managerPw, role: UserRole.MANAGER, companyId: hok.id },
      { name: "HOR Manager", email: "manager@hor.com", password: managerPw, role: UserRole.MANAGER, companyId: hor.id },
      { name: "HOI Staff", email: "staff@hoi.com", password: staffPw, role: UserRole.STAFF, companyId: hoi.id },
      { name: "HOK Staff", email: "staff@hok.com", password: staffPw, role: UserRole.STAFF, companyId: hok.id },
    ],
  });

  // Customers
  const gangnamPharmacy = await prisma.customer.create({
    data: { name: "Gangnam Pharmacy", type: CustomerType.DRUGSTORE, companyId: hok.id, contactInfo: { phone: "+82-2-555-0147", address: "Gangnam-gu, Seoul" } },
  });
  const mapoHealthMart = await prisma.customer.create({
    data: { name: "Mapo Health Mart", type: CustomerType.DRUGSTORE, companyId: hor.id, contactInfo: { phone: "+82-2-332-8821", address: "Mapo-gu, Seoul" } },
  });
  await prisma.customer.createMany({
    data: [
      { name: "Kim Yeji", type: CustomerType.INDIVIDUAL, companyId: hoi.id, contactInfo: { phone: "+82-10-9182-3847", email: "yeji.kim@gmail.com" } },
      { name: "Park Seonghwa", type: CustomerType.INDIVIDUAL, companyId: hoi.id, contactInfo: { phone: "+82-10-4421-7739" } },
      { name: "Jongno Wellness", type: CustomerType.DRUGSTORE, companyId: hok.id, contactInfo: { phone: "+82-2-741-2200", address: "Jongno-gu, Seoul" } },
    ],
  });

  // Products (HOK manufactures, HOI sells same products via transfer)
  const omega3Hok = await prisma.product.create({
    data: { name: "Omega-3 Fish Oil 1000mg", sku: "OMEGA3-1000", category: "Fish Oil", basePrice: 32000, costPrice: 12000, companyId: hok.id },
  });
  const vitD3Hok = await prisma.product.create({
    data: { name: "Vitamin D3 5000IU", sku: "VITD3-5000", category: "Vitamins", basePrice: 18000, costPrice: 6500, companyId: hok.id },
  });
  const probioticsHok = await prisma.product.create({
    data: { name: "Probiotics Complex", sku: "PROBIO-CPX", category: "Probiotics", basePrice: 45000, costPrice: 15000, companyId: hok.id },
  });
  const collagenHok = await prisma.product.create({
    data: { name: "Collagen Peptides", sku: "COLL-PEP", category: "Collagen", basePrice: 38000, costPrice: 14000, companyId: hok.id },
  });

  // Same products in HOI catalog (transferred from HOK)
  const omega3Hoi = await prisma.product.create({
    data: { name: "Omega-3 Fish Oil 1000mg", sku: "OMEGA3-1000", category: "Fish Oil", basePrice: 35000, costPrice: 18000, companyId: hoi.id },
  });
  const vitD3Hoi = await prisma.product.create({
    data: { name: "Vitamin D3 5000IU", sku: "VITD3-5000", category: "Vitamins", basePrice: 22000, costPrice: 10000, companyId: hoi.id },
  });

  // Inventory
  await prisma.inventory.createMany({
    data: [
      { productId: omega3Hok.id, companyId: hok.id, quantity: 2500, warehouseLocation: "HOK-Main", reorderLevel: 500 },
      { productId: vitD3Hok.id, companyId: hok.id, quantity: 1800, warehouseLocation: "HOK-Main", reorderLevel: 300 },
      { productId: probioticsHok.id, companyId: hok.id, quantity: 52, warehouseLocation: "HOK-Main", reorderLevel: 200 },
      { productId: collagenHok.id, companyId: hok.id, quantity: 198, warehouseLocation: "HOK-Main", reorderLevel: 400 },
      { productId: omega3Hoi.id, companyId: hoi.id, quantity: 127, warehouseLocation: "HOI-Main", reorderLevel: 500 },
      { productId: vitD3Hoi.id, companyId: hoi.id, quantity: 84, warehouseLocation: "HOI-Main", reorderLevel: 300 },
    ],
  });

  console.log("Seed data created successfully");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
