import { PrismaClient, CompanyType, CustomerType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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

  // Users (shared public.users)
  const adminPw = await hashPassword("admin123");
  const managerPw = await hashPassword("manager123");
  const staffPw = await hashPassword("staff123");

  const users = [
    { name: "Admin User", email: "admin@hanahone.com", passwordHash: adminPw, authProvider: "credentials" },
    { name: "HOI Manager", email: "manager@hoi.com", passwordHash: managerPw, authProvider: "credentials" },
    { name: "HOK Manager", email: "manager@hok.com", passwordHash: managerPw, authProvider: "credentials" },
    { name: "HOR Manager", email: "manager@hor.com", passwordHash: managerPw, authProvider: "credentials" },
    { name: "HOI Staff", email: "staff@hoi.com", passwordHash: staffPw, authProvider: "credentials" },
    { name: "HOK Staff", email: "staff@hok.com", passwordHash: staffPw, authProvider: "credentials" },
  ];

  const createdUsers = await Promise.all(
    users.map((u) => prisma.user.create({ data: u }))
  );

  // System user
  const systemUser = await prisma.user.create({
    data: {
      name: "System",
      email: "system@hanahone.internal",
      passwordHash: await hashPassword("system-no-login-" + Date.now()),
      authProvider: "credentials",
    },
  });

  // App roles (public.user_app_roles)
  await prisma.userAppRole.createMany({
    data: [
      { userId: createdUsers[0].id, app: "salesone", role: "ADMIN", companyId: hoi.id },
      { userId: createdUsers[1].id, app: "salesone", role: "MANAGER", companyId: hoi.id },
      { userId: createdUsers[2].id, app: "salesone", role: "MANAGER", companyId: hok.id },
      { userId: createdUsers[3].id, app: "salesone", role: "MANAGER", companyId: hor.id },
      { userId: createdUsers[4].id, app: "salesone", role: "STAFF", companyId: hoi.id },
      { userId: createdUsers[5].id, app: "salesone", role: "STAFF", companyId: hok.id },
      { userId: systemUser.id, app: "salesone", role: "ADMIN", companyId: hoi.id },
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

  // Products
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
