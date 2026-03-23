# HanahOne Group ERP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-tenant ERP web app for three supplement companies (HOI, HOK, HOR) with sales, orders, inventory, manufacturing, consulting, and consolidated group reporting.

**Architecture:** Single PostgreSQL database with `company_id` on every table. Next.js 14 App Router frontend with Prisma ORM. Auth.js v5 for role-based auth. Company switcher filters all views. Floating pill navbar, double-bezel card design, Geist font, teal accent.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Prisma, PostgreSQL, Auth.js v5

**Spec:** `docs/superpowers/specs/2026-03-23-hanahone-erp-design.md`

**Design references:** Copy `REDESIGN.md`, `SOFT.md`, `TASTE.md` from `/Users/admin/Desktop/claude/claude_3/ax-hub/` into project root for design guidance.

---

## File Structure

```
hanahone-erp/
├── prisma/
│   ├── schema.prisma              # All models, enums, relations
│   └── seed.ts                    # Seed data: 3 companies, sample users, products, inventory
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout with providers (theme, session, company context)
│   │   ├── globals.css            # Tailwind + Geist font + design tokens (light/dark)
│   │   ├── page.tsx               # Redirect to /dashboard
│   │   ├── login/
│   │   │   └── page.tsx           # Login page
│   │   ├── dashboard/
│   │   │   └── page.tsx           # Dashboard with KPIs, company breakdown, recent orders, alerts
│   │   ├── sales/
│   │   │   └── page.tsx           # Sales list with filters
│   │   ├── orders/
│   │   │   ├── page.tsx           # Order list
│   │   │   └── [id]/
│   │   │       └── page.tsx       # Order detail + status management
│   │   ├── inventory/
│   │   │   └── page.tsx           # Inventory list with low-stock highlights
│   │   ├── products/
│   │   │   ├── page.tsx           # Product list
│   │   │   └── [id]/
│   │   │       └── page.tsx       # Product detail + edit
│   │   ├── customers/
│   │   │   ├── page.tsx           # Customer list
│   │   │   └── [id]/
│   │   │       └── page.tsx       # Customer detail
│   │   ├── transfers/
│   │   │   ├── page.tsx           # Inter-company transfer list
│   │   │   └── [id]/
│   │   │       └── page.tsx       # Transfer detail + status management
│   │   ├── manufacturing/
│   │   │   ├── page.tsx           # Production order list (HOK only)
│   │   │   └── [id]/
│   │   │       └── page.tsx       # Production order detail
│   │   ├── consulting/
│   │   │   └── page.tsx           # Consulting engagements (HOR only)
│   │   ├── reports/
│   │   │   └── page.tsx           # Reports hub with sub-reports
│   │   ├── settings/
│   │   │   └── page.tsx           # User management, company settings
│   │   └── api/
│   │       ├── auth/
│   │       │   └── [...nextauth]/
│   │       │       └── route.ts   # Auth.js route handler
│   │       ├── companies/
│   │       │   └── route.ts       # GET companies list
│   │       ├── products/
│   │       │   └── route.ts       # CRUD products
│   │       ├── inventory/
│   │       │   └── route.ts       # CRUD inventory + adjustments
│   │       ├── orders/
│   │       │   └── route.ts       # CRUD orders + status transitions
│   │       ├── customers/
│   │       │   └── route.ts       # CRUD customers
│   │       ├── transfers/
│   │       │   └── route.ts       # CRUD inter-company transfers
│   │       ├── manufacturing/
│   │       │   └── route.ts       # CRUD production orders
│   │       ├── consulting/
│   │       │   └── route.ts       # CRUD consulting engagements
│   │       ├── reports/
│   │       │   └── route.ts       # Report data endpoints
│   │       └── seed/
│   │           └── route.ts       # Dev-only seed trigger
│   ├── lib/
│   │   ├── prisma.ts              # Prisma client singleton
│   │   ├── auth.ts                # Auth.js config + providers
│   │   ├── auth-utils.ts          # getSession, requireAuth, requireRole helpers
│   │   ├── company-filter.ts      # Builds Prisma where clause from company context
│   │   ├── order-number.ts        # Per-company auto-increment order number generator
│   │   └── inventory-adjuster.ts  # Transactional inventory update + audit trail logging
│   ├── components/
│   │   ├── ui/
│   │   │   ├── card.tsx           # Double-bezel card (shell + inner)
│   │   │   ├── button.tsx         # Pill button with hover/active physics
│   │   │   ├── badge.tsx          # Status badges (shipped, pending, etc.)
│   │   │   ├── input.tsx          # Form input with label above
│   │   │   ├── select.tsx         # Dropdown select
│   │   │   ├── table.tsx          # Data table with sortable columns
│   │   │   ├── kpi-card.tsx       # KPI metric card (value, change, subtitle)
│   │   │   ├── date-filter.tsx    # Pill date range filter (today, 7d, 30d, quarter)
│   │   │   ├── empty-state.tsx    # Composed empty state with icon and CTA
│   │   │   └── skeleton.tsx       # Skeleton loader matching layout shapes
│   │   ├── nav/
│   │   │   ├── top-nav.tsx        # Floating pill navbar
│   │   │   └── company-switcher.tsx # Company pill tabs (Group/HOI/HOK/HOR)
│   │   ├── providers/
│   │   │   ├── theme-provider.tsx # Light/dark mode provider
│   │   │   ├── session-provider.tsx # Auth.js session provider
│   │   │   └── company-provider.tsx # Company context (selected company, switcher state)
│   │   └── dashboard/
│   │       ├── kpi-row.tsx        # 4 KPI cards row
│   │       ├── company-breakdown.tsx # 3 company summary cards
│   │       ├── recent-orders.tsx  # Recent orders table
│   │       └── low-stock-alerts.tsx # Low stock alert list
│   ├── hooks/
│   │   ├── use-company.ts         # Access current company context
│   │   └── use-auth.ts            # Access current session/role
│   └── types/
│       └── index.ts               # Shared TypeScript types/interfaces
├── __tests__/
│   ├── lib/
│   │   ├── company-filter.test.ts
│   │   ├── order-number.test.ts
│   │   └── inventory-adjuster.test.ts
│   └── api/
│       ├── products.test.ts
│       ├── orders.test.ts
│       ├── inventory.test.ts
│       ├── transfers.test.ts
│       └── manufacturing.test.ts
├── .env.local                     # DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── next.config.js
```

---

## Task 1: Project Scaffolding + Prisma Schema

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `.env.local`, `prisma/schema.prisma`, `src/lib/prisma.ts`, `src/app/globals.css`, `src/app/layout.tsx`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd /Users/admin/Desktop/claude/claude_2
npx create-next-app@14 hanahone-erp --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
cd hanahone-erp
```

- [ ] **Step 2: Install dependencies**

```bash
npm install prisma @prisma/client next-auth@beta @auth/prisma-adapter bcryptjs zod
npm install -D vitest @testing-library/react @testing-library/jest-dom @types/bcryptjs
npx prisma init
```

- [ ] **Step 3: Configure Tailwind with Geist font and design tokens**

Update `tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "monospace"],
      },
      colors: {
        accent: {
          DEFAULT: "#0d9488",
          light: "rgba(13, 148, 136, 0.08)",
          dark: "#2dd4bf",
        },
        surface: {
          light: "#ffffff",
          dark: "#16161a",
        },
        bg: {
          light: "#f8f9fa",
          dark: "#0a0a0c",
        },
      },
      borderRadius: {
        "2xl": "20px",
        "3xl": "28px",
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 4: Write globals.css with design tokens**

Replace `src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --bg: #f8f9fa;
    --surface: #ffffff;
    --border: rgba(0, 0, 0, 0.06);
    --border-strong: rgba(0, 0, 0, 0.1);
    --text-primary: #0f1419;
    --text-secondary: #536471;
    --text-tertiary: #8899a6;
    --accent: #0d9488;
    --accent-dim: rgba(13, 148, 136, 0.08);
    --shadow-card: 0 1px 2px rgba(0,0,0,0.04);
    --shadow-card-hover: 0 12px 32px -8px rgba(0,0,0,0.08);
    --radius-lg: 28px;
  }

  .dark {
    --bg: #0a0a0c;
    --surface: #16161a;
    --border: rgba(255, 255, 255, 0.06);
    --border-strong: rgba(255, 255, 255, 0.1);
    --text-primary: #f0f0f3;
    --text-secondary: #8a8a9a;
    --text-tertiary: #55556a;
    --accent: #2dd4bf;
    --accent-dim: rgba(45, 212, 191, 0.10);
    --shadow-card: 0 1px 2px rgba(0,0,0,0.3);
    --shadow-card-hover: 0 12px 32px -8px rgba(0,0,0,0.5);
  }

  body {
    background: var(--bg);
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }
}
```

- [ ] **Step 5: Write Prisma schema with all models**

Write `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum CompanyType {
  MOTHER
  SUBSIDIARY
}

enum UserRole {
  ADMIN
  MANAGER
  STAFF
}

enum CustomerType {
  INDIVIDUAL
  DRUGSTORE
  WHOLESALE
}

enum OrderType {
  SALE
  PURCHASE
  BROKERAGE
  INTER_COMPANY
}

enum OrderStatus {
  PENDING
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
}

enum TransferStatus {
  PENDING
  SHIPPED
  RECEIVED
  CANCELLED
}

enum ProductionStatus {
  PLANNED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum ConsultingStatus {
  ACTIVE
  COMPLETED
  PAUSED
}

enum AdjustmentType {
  MANUAL
  SALE
  PURCHASE
  TRANSFER_OUT
  TRANSFER_IN
  PRODUCTION
}

model Company {
  id              String      @id @default(uuid())
  name            String
  type            CompanyType
  parentCompanyId String?     @map("parent_company_id")
  parentCompany   Company?    @relation("CompanyHierarchy", fields: [parentCompanyId], references: [id])
  subsidiaries    Company[]   @relation("CompanyHierarchy")

  users                  User[]
  customers              Customer[]
  products               Product[]
  inventories            Inventory[]
  orders                 Order[]
  transfersFrom          InterCompanyTransfer[] @relation("TransferFrom")
  transfersTo            InterCompanyTransfer[] @relation("TransferTo")
  productionOrders       ProductionOrder[]
  consultingEngagements  ConsultingEngagement[]
  inventoryAdjustments   InventoryAdjustment[]
  billOfMaterials        BillOfMaterials[]

  @@map("companies")
}

model User {
  id        String   @id @default(uuid())
  name      String
  email     String   @unique
  password  String
  role      UserRole
  companyId String   @map("company_id")
  company   Company  @relation(fields: [companyId], references: [id])

  inventoryAdjustments InventoryAdjustment[]

  @@map("users")
}

model Customer {
  id          String       @id @default(uuid())
  name        String
  contactInfo Json?        @map("contact_info")
  type        CustomerType
  companyId   String       @map("company_id")
  company     Company      @relation(fields: [companyId], references: [id])

  orders                Order[]        @relation("CustomerOrders")
  brokerageOrders       Order[]        @relation("BrokerageCustomer")
  consultingEngagements ConsultingEngagement[]

  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@index([companyId])
  @@map("customers")
}

model Product {
  id          String  @id @default(uuid())
  name        String
  sku         String
  description String?
  category    String
  basePrice   Decimal @map("base_price")
  costPrice   Decimal @map("cost_price")
  companyId   String  @map("company_id")
  company     Company @relation(fields: [companyId], references: [id])

  inventories        Inventory[]
  orderItems         OrderItem[]
  productionOrders   ProductionOrder[]
  bomAsFinished      BillOfMaterials[] @relation("FinishedProduct")
  bomAsRawMaterial   BillOfMaterials[] @relation("RawMaterial")

  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@unique([sku, companyId])
  @@index([companyId])
  @@map("products")
}

model Inventory {
  id                String  @id @default(uuid())
  productId         String  @map("product_id")
  product           Product @relation(fields: [productId], references: [id])
  companyId         String  @map("company_id")
  company           Company @relation(fields: [companyId], references: [id])
  quantity          Int
  warehouseLocation String  @map("warehouse_location")
  reorderLevel      Int     @map("reorder_level")

  adjustments InventoryAdjustment[]

  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@unique([productId, companyId, warehouseLocation])
  @@index([companyId])
  @@map("inventories")
}

model Order {
  id                    String      @id @default(uuid())
  orderNumber           String      @unique @map("order_number")
  companyId             String      @map("company_id")
  company               Company     @relation(fields: [companyId], references: [id])
  customerId            String?     @map("customer_id")
  customer              Customer?   @relation("CustomerOrders", fields: [customerId], references: [id])
  type                  OrderType
  status                OrderStatus @default(PENDING)
  totalAmount           Decimal     @map("total_amount")
  costAmount            Decimal?    @map("cost_amount")
  marginAmount          Decimal?    @map("margin_amount")
  onBehalfOfCustomerId  String?     @map("on_behalf_of_customer_id")
  onBehalfOfCustomer    Customer?   @relation("BrokerageCustomer", fields: [onBehalfOfCustomerId], references: [id])
  orderDate             DateTime    @map("order_date")
  shipDate              DateTime?   @map("ship_date")
  notes                 String?

  items     OrderItem[]
  transfer  InterCompanyTransfer?

  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@index([companyId, orderDate])
  @@index([companyId, status])
  @@index([companyId, type])
  @@map("orders")
}

model OrderItem {
  id        String  @id @default(uuid())
  orderId   String  @map("order_id")
  order     Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId String  @map("product_id")
  product   Product @relation(fields: [productId], references: [id])
  quantity  Int
  unitPrice Decimal @map("unit_price")
  subtotal  Decimal

  @@index([orderId])
  @@map("order_items")
}

model InterCompanyTransfer {
  id            String         @id @default(uuid())
  fromCompanyId String         @map("from_company_id")
  fromCompany   Company        @relation("TransferFrom", fields: [fromCompanyId], references: [id])
  toCompanyId   String         @map("to_company_id")
  toCompany     Company        @relation("TransferTo", fields: [toCompanyId], references: [id])
  orderId       String         @unique @map("order_id")
  order         Order          @relation(fields: [orderId], references: [id])
  status        TransferStatus @default(PENDING)
  transferDate  DateTime       @map("transfer_date")
  receivedDate  DateTime?      @map("received_date")

  @@map("inter_company_transfers")
}

model ProductionOrder {
  id                String           @id @default(uuid())
  companyId         String           @map("company_id")
  company           Company          @relation(fields: [companyId], references: [id])
  productId         String           @map("product_id")
  product           Product          @relation(fields: [productId], references: [id])
  quantityToProduce Int              @map("quantity_to_produce")
  quantityProduced  Int              @default(0) @map("quantity_produced")
  status            ProductionStatus @default(PLANNED)
  startDate         DateTime         @map("start_date")
  endDate           DateTime?        @map("end_date")
  notes             String?

  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@index([companyId, status])
  @@map("production_orders")
}

model ConsultingEngagement {
  id            String           @id @default(uuid())
  companyId     String           @map("company_id")
  company       Company          @relation(fields: [companyId], references: [id])
  customerId    String           @map("customer_id")
  customer      Customer         @relation(fields: [customerId], references: [id])
  title         String
  status        ConsultingStatus @default(ACTIVE)
  startDate     DateTime         @map("start_date")
  endDate       DateTime?        @map("end_date")
  billingAmount Decimal          @map("billing_amount")
  notes         String?

  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@index([companyId])
  @@map("consulting_engagements")
}

model InventoryAdjustment {
  id               String         @id @default(uuid())
  inventoryId      String         @map("inventory_id")
  inventory        Inventory      @relation(fields: [inventoryId], references: [id])
  companyId        String         @map("company_id")
  company          Company        @relation(fields: [companyId], references: [id])
  adjustmentType   AdjustmentType @map("adjustment_type")
  quantityChange   Int            @map("quantity_change")
  previousQuantity Int            @map("previous_quantity")
  newQuantity      Int            @map("new_quantity")
  referenceId      String?        @map("reference_id")
  reason           String?
  createdBy        String         @map("created_by")
  createdByUser    User           @relation(fields: [createdBy], references: [id])
  createdAt        DateTime       @default(now()) @map("created_at")

  @@index([inventoryId])
  @@index([companyId, createdAt])
  @@map("inventory_adjustments")
}

model BillOfMaterials {
  id                String  @id @default(uuid())
  companyId         String  @map("company_id")
  company           Company @relation(fields: [companyId], references: [id])
  finishedProductId String  @map("finished_product_id")
  finishedProduct   Product @relation("FinishedProduct", fields: [finishedProductId], references: [id])
  rawMaterialId     String  @map("raw_material_id")
  rawMaterial       Product @relation("RawMaterial", fields: [rawMaterialId], references: [id])
  quantityRequired  Decimal @map("quantity_required")

  @@map("bill_of_materials")
}
```

- [ ] **Step 6: Write Prisma client singleton**

Write `src/lib/prisma.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 7: Set up .env.local**

Write `.env.local`:

```
DATABASE_URL="postgresql://user:password@localhost:5432/hanahone_erp"
NEXTAUTH_SECRET="dev-secret-change-in-production"
NEXTAUTH_URL="http://localhost:3000"
```

- [ ] **Step 8: Add .gitignore**

Ensure `.gitignore` includes:

```
node_modules/
.env
.env.local
.env.*.local
.next/
```

- [ ] **Step 9: Generate Prisma client and verify schema**

```bash
npx prisma generate
```

Expected: No errors, client generated successfully.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold project with Prisma schema for all ERP models"
```

---

## Task 2: Seed Data

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (add prisma seed script)

- [ ] **Step 1: Write seed file**

Write `prisma/seed.ts`:

```typescript
import { PrismaClient, CompanyType, UserRole, CustomerType, OrderType, OrderStatus } from "@prisma/client";
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
```

- [ ] **Step 2: Add seed script to package.json**

Add to `package.json`:

```json
"prisma": {
  "seed": "npx tsx prisma/seed.ts"
}
```

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts package.json
git commit -m "feat: add seed data with 3 companies, users, products, inventory"
```

---

## Task 3: Auth.js Setup + Login Page

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/auth-utils.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/login/page.tsx`, `src/components/providers/session-provider.tsx`
- Test: `__tests__/lib/auth-utils.test.ts`

- [ ] **Step 1: Write auth-utils test**

Write `__tests__/lib/auth-utils.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { canAccessCompany, getAccessibleCompanyIds } from "@/lib/auth-utils";

describe("canAccessCompany", () => {
  it("ADMIN can access any company", () => {
    expect(canAccessCompany("ADMIN", "hoi-id", "hok-id")).toBe(true);
  });

  it("MANAGER can only access own company", () => {
    expect(canAccessCompany("MANAGER", "hoi-id", "hoi-id")).toBe(true);
    expect(canAccessCompany("MANAGER", "hoi-id", "hok-id")).toBe(false);
  });

  it("STAFF can only access own company", () => {
    expect(canAccessCompany("STAFF", "hoi-id", "hoi-id")).toBe(true);
    expect(canAccessCompany("STAFF", "hoi-id", "hok-id")).toBe(false);
  });

  it("ADMIN can access group view (null companyId)", () => {
    expect(canAccessCompany("ADMIN", "hoi-id", null)).toBe(true);
  });

  it("non-ADMIN cannot access group view", () => {
    expect(canAccessCompany("MANAGER", "hoi-id", null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/auth-utils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write auth-utils implementation**

Write `src/lib/auth-utils.ts`:

```typescript
import { UserRole } from "@prisma/client";

export function canAccessCompany(
  role: string,
  userCompanyId: string,
  targetCompanyId: string | null
): boolean {
  if (role === UserRole.ADMIN) return true;
  if (targetCompanyId === null) return false;
  return userCompanyId === targetCompanyId;
}

export function getAccessibleCompanyIds(
  role: string,
  userCompanyId: string,
  allCompanyIds: string[]
): string[] {
  if (role === UserRole.ADMIN) return allCompanyIds;
  return [userCompanyId];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/auth-utils.test.ts`
Expected: PASS

- [ ] **Step 5: Write Auth.js config**

Write `src/lib/auth.ts`:

```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: { company: true },
        });

        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password as string, user.password);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          companyName: user.company.name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.companyId = (user as any).companyId;
        token.companyName = (user as any).companyName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
        (session.user as any).companyId = token.companyId;
        (session.user as any).companyName = token.companyName;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
```

- [ ] **Step 6: Write Auth.js route handler**

Write `src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 7: Write session provider**

Write `src/components/providers/session-provider.tsx`:

```typescript
"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
```

- [ ] **Step 8: Write login page**

Write `src/app/login/page.tsx`:

```typescript
"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password");
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight">
            Hanah<span className="text-accent">One</span>
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2">Sign in to your account</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm focus:outline-none focus:border-accent"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm focus:outline-none focus:border-accent"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full py-2.5 rounded-full bg-accent text-white text-sm font-semibold transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Write Next.js middleware for route protection**

Write `src/middleware.ts`:

```typescript
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === "/login";
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");

  if (isApiAuth) return NextResponse.next();

  if (!isLoggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 10: Write API auth guard helper**

Write `src/lib/api-guard.ts`:

```typescript
import { auth } from "@/lib/auth";
import { canAccessCompany } from "@/lib/auth-utils";
import { NextResponse } from "next/server";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  }
  return { error: null, session };
}

export async function requireCompanyAccess(targetCompanyId: string | null) {
  const { error, session } = await requireAuth();
  if (error) return { error, session: null };

  const user = session!.user as any;
  if (!canAccessCompany(user.role, user.companyId, targetCompanyId)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), session: null };
  }
  return { error: null, session };
}
```

All API routes must call `requireAuth()` or `requireCompanyAccess()` at the start and return early if `error` is set. The `userId` for audit trails must come from `session.user.id`, never from the request body.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add Auth.js v5 with bcrypt, route protection middleware, API auth guards"
```

---

## Task 4: Company Provider + Navbar + Layout Shell

**Files:**
- Create: `src/components/providers/company-provider.tsx`, `src/hooks/use-company.ts`, `src/components/nav/top-nav.tsx`, `src/components/nav/company-switcher.tsx`, `src/components/providers/theme-provider.tsx`
- Modify: `src/app/layout.tsx`
- Test: `__tests__/lib/company-filter.test.ts`

- [ ] **Step 1: Write company-filter test**

Write `__tests__/lib/company-filter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildCompanyFilter } from "@/lib/company-filter";

describe("buildCompanyFilter", () => {
  it("returns empty where for group view (null)", () => {
    expect(buildCompanyFilter(null)).toEqual({});
  });

  it("returns companyId filter for specific company", () => {
    expect(buildCompanyFilter("abc-123")).toEqual({ companyId: "abc-123" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/company-filter.test.ts`
Expected: FAIL

- [ ] **Step 3: Write company-filter implementation**

Write `src/lib/company-filter.ts`:

```typescript
export function buildCompanyFilter(companyId: string | null): Record<string, string> {
  if (!companyId) return {};
  return { companyId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/company-filter.test.ts`
Expected: PASS

- [ ] **Step 5: Write company provider**

Write `src/components/providers/company-provider.tsx`:

```typescript
"use client";

import { createContext, useState, useCallback, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

type CompanyOption = { id: string; name: string } | null;

interface CompanyContextType {
  selectedCompany: CompanyOption;
  setSelectedCompany: (company: CompanyOption) => void;
  companies: { id: string; name: string }[];
}

export const CompanyContext = createContext<CompanyContextType>({
  selectedCompany: null,
  setSelectedCompany: () => {},
  companies: [],
});

export function CompanyProvider({
  children,
  companies,
}: {
  children: React.ReactNode;
  companies: { id: string; name: string }[];
}) {
  const [selectedCompany, setSelectedCompany] = useState<CompanyOption>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Sync URL search param to state on mount
  useEffect(() => {
    const companyId = searchParams.get("company");
    if (companyId) {
      const found = companies.find((c) => c.id === companyId);
      if (found) setSelectedCompany(found);
    }
  }, []);

  // When company changes, update URL search param
  const handleSetCompany = useCallback((company: CompanyOption) => {
    setSelectedCompany(company);
    const params = new URLSearchParams(searchParams.toString());
    if (company) {
      params.set("company", company.id);
    } else {
      params.delete("company");
    }
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  return (
    <CompanyContext.Provider value={{ selectedCompany, setSelectedCompany: handleSetCompany, companies }}>
      {children}
    </CompanyContext.Provider>
  );
}
```

- [ ] **Step 6: Write use-company hook**

Write `src/hooks/use-company.ts`:

```typescript
"use client";

import { useContext } from "react";
import { CompanyContext } from "@/components/providers/company-provider";

export function useCompany() {
  return useContext(CompanyContext);
}
```

- [ ] **Step 7: Write theme provider**

Write `src/components/providers/theme-provider.tsx`:

```typescript
"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: "light",
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    const preferred = stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(preferred);
    document.documentElement.classList.toggle("dark", preferred === "dark");
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

- [ ] **Step 8: Write company switcher component**

Write `src/components/nav/company-switcher.tsx`:

```typescript
"use client";

import { useCompany } from "@/hooks/use-company";

export function CompanySwitcher() {
  const { selectedCompany, setSelectedCompany, companies } = useCompany();

  return (
    <div className="flex items-center gap-0.5 bg-[var(--bg)] border border-[var(--border)] rounded-full p-0.5">
      <button
        onClick={() => setSelectedCompany(null)}
        className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 ${
          selectedCompany === null
            ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
            : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
        }`}
      >
        Group
      </button>
      {companies.map((company) => (
        <button
          key={company.id}
          onClick={() => setSelectedCompany(company)}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 ${
            selectedCompany?.id === company.id
              ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          }`}
        >
          {company.name}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 9: Write top nav component**

Write `src/components/nav/top-nav.tsx`:

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CompanySwitcher } from "./company-switcher";
import { useTheme } from "@/components/providers/theme-provider";

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/sales", label: "Sales" },
  { href: "/orders", label: "Orders" },
  { href: "/inventory", label: "Inventory" },
  { href: "/products", label: "Products" },
  { href: "/customers", label: "Customers" },
  { href: "/transfers", label: "Transfers" },
  { href: "/manufacturing", label: "Manufacturing" },
  { href: "/consulting", label: "Consulting" },
  { href: "/reports", label: "Reports" },
];

export function TopNav() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="sticky top-4 z-40 max-w-[1400px] mx-auto px-6">
      <div className="bg-[var(--surface)]/80 backdrop-blur-xl border border-[var(--border)] rounded-full px-6 py-2.5 flex items-center justify-between shadow-[0_4px_20px_-2px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="font-bold text-[15px] tracking-tight">
            Hanah<span className="text-accent">One</span>
          </Link>
          <div className="flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 text-[13px] font-medium rounded-full transition-all duration-200 ${
                  pathname === link.href || pathname?.startsWith(link.href + "/")
                    ? "text-accent bg-[var(--accent-dim)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <CompanySwitcher />
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-all duration-200 text-sm"
            aria-label="Toggle theme"
          >
            {theme === "light" ? "D" : "L"}
          </button>
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 10: Update root layout**

Write `src/app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/providers/session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { CompanyProvider } from "@/components/providers/company-provider";
import { TopNav } from "@/components/nav/top-nav";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "HanahOne ERP",
  description: "HanahOne Group ERP — Sales, Orders, Inventory",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <SessionProvider>
          <ThemeProvider>
            <CompanyProvider companies={companies}>
              <TopNav />
              <main className="max-w-[1400px] mx-auto px-6 py-10">
                {children}
              </main>
            </CompanyProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add company provider, floating pill navbar, theme toggle, layout shell"
```

---

## Task 5: UI Component Library

**Files:**
- Create: `src/components/ui/card.tsx`, `src/components/ui/button.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/kpi-card.tsx`, `src/components/ui/table.tsx`, `src/components/ui/input.tsx`, `src/components/ui/empty-state.tsx`, `src/components/ui/skeleton.tsx`, `src/components/ui/date-filter.tsx`

- [ ] **Step 1: Write double-bezel card**

Write `src/components/ui/card.tsx`:

```typescript
interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div className={`bg-black/[0.02] dark:bg-white/[0.02] border border-[var(--border)] rounded-3xl p-1.5 transition-all duration-300 hover:shadow-[var(--shadow-card-hover)] hover:border-[var(--border-strong)] ${className}`}>
      <div className="bg-[var(--surface)] rounded-[calc(1.5rem-6px)] p-7 h-full shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] relative overflow-hidden">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write button**

Write `src/components/ui/button.tsx`:

```typescript
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}

export function Button({ variant = "primary", size = "md", className = "", children, ...props }: ButtonProps) {
  const base = "inline-flex items-center justify-center font-semibold rounded-full transition-all duration-200 active:scale-[0.98]";
  const sizes = { sm: "px-4 py-1.5 text-xs", md: "px-6 py-2.5 text-sm" };
  const variants = {
    primary: "bg-accent text-white hover:opacity-90",
    secondary: "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--border-strong)]",
    ghost: "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
  };

  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Write badge**

Write `src/components/ui/badge.tsx`:

```typescript
const badgeStyles: Record<string, string> = {
  shipped: "text-teal-600 bg-teal-600/[0.08] dark:text-teal-400 dark:bg-teal-400/[0.10]",
  delivered: "text-teal-600 bg-teal-600/[0.08] dark:text-teal-400 dark:bg-teal-400/[0.10]",
  received: "text-teal-600 bg-teal-600/[0.08] dark:text-teal-400 dark:bg-teal-400/[0.10]",
  pending: "text-amber-600 bg-amber-600/[0.08] dark:text-amber-400 dark:bg-amber-400/[0.10]",
  processing: "text-indigo-600 bg-indigo-600/[0.08] dark:text-indigo-400 dark:bg-indigo-400/[0.10]",
  cancelled: "text-red-600 bg-red-600/[0.08] dark:text-red-400 dark:bg-red-400/[0.10]",
  active: "text-teal-600 bg-teal-600/[0.08] dark:text-teal-400 dark:bg-teal-400/[0.10]",
  planned: "text-slate-600 bg-slate-600/[0.08] dark:text-slate-400 dark:bg-slate-400/[0.10]",
  in_progress: "text-blue-600 bg-blue-600/[0.08] dark:text-blue-400 dark:bg-blue-400/[0.10]",
  completed: "text-teal-600 bg-teal-600/[0.08] dark:text-teal-400 dark:bg-teal-400/[0.10]",
  paused: "text-amber-600 bg-amber-600/[0.08] dark:text-amber-400 dark:bg-amber-400/[0.10]",
};

export function Badge({ status }: { status: string }) {
  const key = status.toLowerCase().replace(/ /g, "_");
  const style = badgeStyles[key] || badgeStyles.pending;

  return (
    <span className={`inline-flex px-2.5 py-0.5 text-[11px] font-semibold rounded-full ${style}`}>
      {status}
    </span>
  );
}
```

- [ ] **Step 4: Write KPI card**

Write `src/components/ui/kpi-card.tsx`:

```typescript
import { Card } from "./card";

interface KpiCardProps {
  label: string;
  value: string;
  change?: { value: string; direction: "up" | "down" | "neutral" };
  subtitle?: string;
}

export function KpiCard({ label, value, change, subtitle }: KpiCardProps) {
  const changeColors = {
    up: "text-teal-600 bg-teal-600/[0.08] dark:text-teal-400 dark:bg-teal-400/[0.10]",
    down: "text-rose-600 bg-rose-600/[0.08] dark:text-rose-400 dark:bg-rose-400/[0.10]",
    neutral: "text-[var(--text-tertiary)] bg-black/[0.04] dark:bg-white/[0.04]",
  };

  return (
    <Card>
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-4">
        {label}
      </div>
      <div className="text-4xl font-bold tracking-tighter leading-none">{value}</div>
      {change && (
        <div className={`inline-flex items-center gap-1 mt-2.5 text-[13px] font-semibold px-2.5 py-0.5 rounded-full ${changeColors[change.direction]}`}>
          {change.value}
        </div>
      )}
      {subtitle && (
        <div className="text-[13px] text-[var(--text-tertiary)] mt-1.5">{subtitle}</div>
      )}
    </Card>
  );
}
```

- [ ] **Step 5: Write remaining UI components (input, empty-state, skeleton, date-filter, table)**

Write `src/components/ui/input.tsx`:

```typescript
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, className = "", ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-[var(--text-secondary)]">{label}</label>
      <input
        className={`w-full px-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm focus:outline-none focus:border-accent transition-colors ${error ? "border-red-500" : ""} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
```

Write `src/components/ui/empty-state.tsx`:

```typescript
export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center mb-4">
        <span className="text-accent text-lg">+</span>
      </div>
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <p className="text-xs text-[var(--text-tertiary)] max-w-[300px] mb-4">{description}</p>
      {action}
    </div>
  );
}
```

Write `src/components/ui/skeleton.tsx`:

```typescript
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-black/[0.06] dark:bg-white/[0.06] rounded-xl ${className}`} />;
}
```

Write `src/components/ui/date-filter.tsx`:

```typescript
"use client";

import { useState } from "react";

const options = ["Today", "7 days", "30 days", "Quarter"];

export function DateFilter({ onChange }: { onChange?: (value: string) => void }) {
  const [selected, setSelected] = useState("30 days");

  return (
    <div className="flex gap-0.5 bg-[var(--bg)] border border-[var(--border)] rounded-full p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => { setSelected(opt); onChange?.(opt); }}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
            selected === opt
              ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-tertiary)]"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
```

Write `src/components/ui/table.tsx`:

```typescript
interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right";
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
}

export function DataTable<T>({ columns, data }: DataTableProps<T>) {
  return (
    <div>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
        {columns.map((col) => (
          <div key={col.key} className={`text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] pb-3 border-b border-[var(--border)] ${col.align === "right" ? "text-right" : ""}`}>
            {col.header}
          </div>
        ))}
        {data.map((row, i) =>
          columns.map((col) => (
            <div key={`${i}-${col.key}`} className={`py-3 text-[13px] border-b border-[var(--border)] ${col.align === "right" ? "text-right" : ""}`}>
              {col.render(row)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add UI component library (card, button, badge, kpi, table, input, etc.)"
```

---

## Task 6: API Routes — Products + Inventory

**Files:**
- Create: `src/app/api/products/route.ts`, `src/app/api/inventory/route.ts`, `src/lib/inventory-adjuster.ts`
- Test: `__tests__/lib/inventory-adjuster.test.ts`

- [ ] **Step 1: Write inventory-adjuster test**

Write `__tests__/lib/inventory-adjuster.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { calculateAdjustment } from "@/lib/inventory-adjuster";

describe("calculateAdjustment", () => {
  it("calculates sale deduction correctly", () => {
    const result = calculateAdjustment(100, -30, "SALE");
    expect(result).toEqual({
      previousQuantity: 100,
      newQuantity: 70,
      quantityChange: -30,
      adjustmentType: "SALE",
    });
  });

  it("calculates production addition correctly", () => {
    const result = calculateAdjustment(100, 50, "PRODUCTION");
    expect(result).toEqual({
      previousQuantity: 100,
      newQuantity: 150,
      quantityChange: 50,
      adjustmentType: "PRODUCTION",
    });
  });

  it("throws if deduction would go negative", () => {
    expect(() => calculateAdjustment(10, -20, "SALE")).toThrow("Insufficient inventory");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/inventory-adjuster.test.ts`
Expected: FAIL

- [ ] **Step 3: Write inventory-adjuster implementation**

Write `src/lib/inventory-adjuster.ts`:

```typescript
import { AdjustmentType } from "@prisma/client";

export function calculateAdjustment(
  currentQuantity: number,
  change: number,
  type: string
): {
  previousQuantity: number;
  newQuantity: number;
  quantityChange: number;
  adjustmentType: string;
} {
  const newQuantity = currentQuantity + change;
  if (newQuantity < 0) {
    throw new Error("Insufficient inventory");
  }
  return {
    previousQuantity: currentQuantity,
    newQuantity,
    quantityChange: change,
    adjustmentType: type,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/inventory-adjuster.test.ts`
Expected: PASS

- [ ] **Step 5: Write products API route**

Write `src/app/api/products/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  const where = companyId ? { companyId } : {};

  const products = await prisma.product.findMany({
    where,
    include: { company: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(products);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const product = await prisma.product.create({ data: body });
  return NextResponse.json(product, { status: 201 });
}
```

- [ ] **Step 6: Write inventory API route**

Write `src/app/api/inventory/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateAdjustment } from "@/lib/inventory-adjuster";

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  const lowStockOnly = req.nextUrl.searchParams.get("lowStock") === "true";
  const where: any = companyId ? { companyId } : {};

  const inventories = await prisma.inventory.findMany({
    where,
    include: {
      product: { select: { name: true, sku: true, category: true } },
      company: { select: { name: true } },
    },
    orderBy: { quantity: "asc" },
  });

  if (lowStockOnly) {
    return NextResponse.json(inventories.filter((inv) => inv.quantity <= inv.reorderLevel));
  }

  return NextResponse.json(inventories);
}

export async function PATCH(req: NextRequest) {
  const { inventoryId, change, type, reason, userId } = await req.json();

  const { error, session } = await requireAuth();
  if (error) return error;
  const currentUserId = (session!.user as any).id;

  const result = await prisma.$transaction(async (tx) => {
    // Row-level lock to prevent lost updates under concurrent writes
    const [inventory] = await tx.$queryRaw`
      SELECT * FROM inventories WHERE id = ${inventoryId}::uuid FOR UPDATE
    ` as any[];

    if (!inventory) throw new Error("Inventory not found");

    const adj = calculateAdjustment(inventory.quantity, change, type);

    const updated = await tx.inventory.update({
      where: { id: inventoryId },
      data: { quantity: adj.newQuantity },
    });

    await tx.inventoryAdjustment.create({
      data: {
        inventoryId,
        companyId: inventory.company_id,
        adjustmentType: type,
        quantityChange: adj.quantityChange,
        previousQuantity: adj.previousQuantity,
        newQuantity: adj.newQuantity,
        reason,
        createdBy: currentUserId,
      },
    });

    return updated;
  });

  return NextResponse.json(result);
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add products and inventory API routes with transactional adjustments"
```

---

## Task 7: API Routes — Orders + Order Number Generator

**Files:**
- Create: `src/app/api/orders/route.ts`, `src/lib/order-number.ts`
- Test: `__tests__/lib/order-number.test.ts`

- [ ] **Step 1: Write order-number test**

Write `__tests__/lib/order-number.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatOrderNumber } from "@/lib/order-number";

describe("formatOrderNumber", () => {
  it("formats HOI order number", () => {
    expect(formatOrderNumber("HOI", 1)).toBe("HOI-0001");
    expect(formatOrderNumber("HOI", 42)).toBe("HOI-0042");
    expect(formatOrderNumber("HOI", 10000)).toBe("HOI-10000");
  });

  it("formats HOK order number", () => {
    expect(formatOrderNumber("HOK", 1)).toBe("HOK-0001");
  });

  it("formats HOR order number", () => {
    expect(formatOrderNumber("HOR", 5)).toBe("HOR-0005");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/order-number.test.ts`
Expected: FAIL

- [ ] **Step 3: Write order-number implementation**

Write `src/lib/order-number.ts`:

```typescript
import { prisma } from "./prisma";

export function formatOrderNumber(companyName: string, sequence: number): string {
  const padded = sequence.toString().padStart(4, "0");
  return `${companyName}-${padded}`;
}

export async function generateOrderNumber(companyId: string, tx?: any): Promise<string> {
  const db = tx || prisma;
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });

  // Use SELECT FOR UPDATE to prevent race conditions on concurrent order creation
  const [result] = await db.$queryRaw`
    SELECT COALESCE(
      (SELECT order_number FROM orders WHERE company_id = ${companyId}::uuid ORDER BY created_at DESC LIMIT 1),
      ${company.name + '-0000'}
    ) as last_number FOR UPDATE
  ` as any[];

  const lastSeq = parseInt(result.last_number.split('-')[1]) || 0;
  return formatOrderNumber(company.name, lastSeq + 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/order-number.test.ts`
Expected: PASS

- [ ] **Step 5: Write orders API route**

Write `src/app/api/orders/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOrderNumber } from "@/lib/order-number";

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  const type = req.nextUrl.searchParams.get("type");
  const status = req.nextUrl.searchParams.get("status");

  const where: any = {};
  if (companyId) where.companyId = companyId;
  if (type) where.type = type;
  if (status) where.status = status;

  const orders = await prisma.order.findMany({
    where,
    include: {
      customer: { select: { name: true } },
      onBehalfOfCustomer: { select: { name: true } },
      company: { select: { name: true } },
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
    orderBy: { orderDate: "desc" },
    take: 50,
  });

  return NextResponse.json(orders);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const orderNumber = await generateOrderNumber(body.companyId);

  const order = await prisma.order.create({
    data: {
      ...body,
      orderNumber,
      items: body.items ? { create: body.items } : undefined,
    },
    include: { items: true },
  });

  return NextResponse.json(order, { status: 201 });
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add orders API with per-company auto-increment order numbers"
```

---

## Task 8: API Routes — Transfers, Manufacturing, Consulting, Customers

**Files:**
- Create: `src/app/api/transfers/route.ts`, `src/app/api/manufacturing/route.ts`, `src/app/api/consulting/route.ts`, `src/app/api/customers/route.ts`

- [ ] **Step 1: Write transfers API**

Write `src/app/api/transfers/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateAdjustment } from "@/lib/inventory-adjuster";

export async function GET(req: NextRequest) {
  const transfers = await prisma.interCompanyTransfer.findMany({
    include: {
      fromCompany: { select: { name: true } },
      toCompany: { select: { name: true } },
      order: { include: { items: { include: { product: { select: { name: true } } } } } },
    },
    orderBy: { transferDate: "desc" },
  });

  return NextResponse.json(transfers);
}

export async function PATCH(req: NextRequest) {
  const { error, session } = await requireCompanyAccess(null); // ADMINs only for transfers
  if (error) return error;
  const currentUserId = (session!.user as any).id;

  const { transferId, status } = await req.json();

  // SHIPPED: deduct from source company inventory
  if (status === "SHIPPED") {
    const result = await prisma.$transaction(async (tx) => {
      const transfer = await tx.interCompanyTransfer.findUniqueOrThrow({
        where: { id: transferId },
        include: { order: { include: { items: true } } },
      });

      const updated = await tx.interCompanyTransfer.update({
        where: { id: transferId },
        data: { status: "SHIPPED" },
      });

      for (const item of transfer.order.items) {
        const [inventory] = await tx.$queryRaw`
          SELECT * FROM inventories WHERE product_id = ${item.productId}::uuid AND company_id = ${transfer.fromCompanyId}::uuid FOR UPDATE
        ` as any[];

        if (inventory) {
          const adj = calculateAdjustment(inventory.quantity, -item.quantity, "TRANSFER_OUT");
          await tx.inventory.update({ where: { id: inventory.id }, data: { quantity: adj.newQuantity } });
          await tx.inventoryAdjustment.create({
            data: {
              inventoryId: inventory.id,
              companyId: transfer.fromCompanyId,
              adjustmentType: "TRANSFER_OUT",
              quantityChange: -item.quantity,
              previousQuantity: adj.previousQuantity,
              newQuantity: adj.newQuantity,
              referenceId: transfer.id,
              createdBy: currentUserId,
            },
          });
        }
      }

      return updated;
    });

    return NextResponse.json(result);
  }

  // RECEIVED: increment receiving company inventory
  if (status === "RECEIVED") {
    const result = await prisma.$transaction(async (tx) => {
      const transfer = await tx.interCompanyTransfer.findUniqueOrThrow({
        where: { id: transferId },
        include: { order: { include: { items: true } } },
      });

      // Update transfer status
      const updated = await tx.interCompanyTransfer.update({
        where: { id: transferId },
        data: { status: "RECEIVED", receivedDate: new Date() },
      });

      // Increment receiving company inventory for each item
      for (const item of transfer.order.items) {
        const inventory = await tx.inventory.findFirst({
          where: { productId: item.productId, companyId: transfer.toCompanyId },
        });

        if (inventory) {
          const adj = calculateAdjustment(inventory.quantity, item.quantity, "TRANSFER_IN");
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { quantity: adj.newQuantity },
          });
          await tx.inventoryAdjustment.create({
            data: {
              inventoryId: inventory.id,
              companyId: transfer.toCompanyId,
              adjustmentType: "TRANSFER_IN",
              quantityChange: item.quantity,
              previousQuantity: adj.previousQuantity,
              newQuantity: adj.newQuantity,
              referenceId: transfer.id,
              createdBy: currentUserId,
            },
          });
        }
      }

      return updated;
    });

    return NextResponse.json(result);
  }

  const updated = await prisma.interCompanyTransfer.update({
    where: { id: transferId },
    data: { status },
  });

  return NextResponse.json(updated);
}
```

- [ ] **Step 2: Write manufacturing API**

Write `src/app/api/manufacturing/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  const where: any = companyId ? { companyId } : {};

  const orders = await prisma.productionOrder.findMany({
    where,
    include: {
      product: { select: { name: true, sku: true } },
      company: { select: { name: true } },
    },
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json(orders);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const order = await prisma.productionOrder.create({ data: body });
  return NextResponse.json(order, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { id, ...data } = await req.json();
  const updated = await prisma.productionOrder.update({ where: { id }, data });
  return NextResponse.json(updated);
}
```

- [ ] **Step 3: Write consulting API**

Write `src/app/api/consulting/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  const where: any = companyId ? { companyId } : {};

  const engagements = await prisma.consultingEngagement.findMany({
    where,
    include: {
      customer: { select: { name: true } },
      company: { select: { name: true } },
    },
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json(engagements);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const engagement = await prisma.consultingEngagement.create({ data: body });
  return NextResponse.json(engagement, { status: 201 });
}
```

- [ ] **Step 4: Write customers API**

Write `src/app/api/customers/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  const type = req.nextUrl.searchParams.get("type");
  const where: any = {};
  if (companyId) where.companyId = companyId;
  if (type) where.type = type;

  const customers = await prisma.customer.findMany({
    where,
    include: { company: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(customers);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const customer = await prisma.customer.create({ data: body });
  return NextResponse.json(customer, { status: 201 });
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add API routes for transfers, manufacturing, consulting, customers"
```

---

## Task 9: Dashboard Page

**Files:**
- Create: `src/app/dashboard/page.tsx`, `src/components/dashboard/kpi-row.tsx`, `src/components/dashboard/company-breakdown.tsx`, `src/components/dashboard/recent-orders.tsx`, `src/components/dashboard/low-stock-alerts.tsx`
- Modify: `src/app/page.tsx` (redirect to /dashboard)

- [ ] **Step 1: Write redirect from root**

Write `src/app/page.tsx`:

```typescript
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

- [ ] **Step 2: Write KPI row component**

Write `src/components/dashboard/kpi-row.tsx`:

```typescript
import { KpiCard } from "@/components/ui/kpi-card";

interface KpiData {
  totalSales: number;
  openOrders: number;
  inventoryValue: number;
  productionRuns: number;
  salesChange: number;
  pendingShipments: number;
  lowStockCount: number;
  newProductionRuns: number;
}

export function KpiRow({ data }: { data: KpiData }) {
  const formatWon = (n: number) => {
    if (n >= 1_000_000_000) return `₩${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000) return `₩${(n / 1_000_000).toFixed(1)}M`;
    return `₩${n.toLocaleString()}`;
  };

  return (
    <div className="grid grid-cols-4 gap-4">
      <KpiCard
        label="Total sales"
        value={formatWon(data.totalSales)}
        change={{ value: `${data.salesChange > 0 ? "+" : ""}${data.salesChange}%`, direction: data.salesChange >= 0 ? "up" : "down" }}
        subtitle="vs previous period"
      />
      <KpiCard
        label="Open orders"
        value={data.openOrders.toString()}
        change={{ value: `${data.pendingShipments} pending shipment`, direction: "neutral" }}
        subtitle="across all entities"
      />
      <KpiCard
        label="Inventory value"
        value={formatWon(data.inventoryValue)}
        change={{ value: `${data.lowStockCount} below reorder`, direction: data.lowStockCount > 0 ? "down" : "neutral" }}
        subtitle="combined warehouse stock"
      />
      <KpiCard
        label="Production runs"
        value={data.productionRuns.toString()}
        change={{ value: `${data.newProductionRuns} new this week`, direction: "up" }}
        subtitle="HOK manufacturing"
      />
    </div>
  );
}
```

- [ ] **Step 3: Write company breakdown component**

Write `src/components/dashboard/company-breakdown.tsx`:

```typescript
import { Card } from "@/components/ui/card";

interface CompanyData {
  name: string;
  color: string;
  stats: { label: string; value: string }[];
}

export function CompanyBreakdown({ companies }: { companies: CompanyData[] }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {companies.map((c) => (
        <Card key={c.name}>
          <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t" style={{ background: c.color }} />
          <div className="font-bold text-sm mb-4" style={{ color: c.color }}>{c.name}</div>
          {c.stats.map((s) => (
            <div key={s.label} className="flex justify-between items-baseline py-2 border-b border-[var(--border)] last:border-b-0">
              <span className="text-[13px] text-[var(--text-secondary)]">{s.label}</span>
              <span className="text-sm font-semibold">{s.value}</span>
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write recent orders component**

Write `src/components/dashboard/recent-orders.tsx`:

```typescript
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface RecentOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  totalAmount: number;
  isTransfer?: boolean;
  transferLabel?: string;
}

export function RecentOrders({ orders }: { orders: RecentOrder[] }) {
  const formatWon = (n: number) => n >= 1_000_000 ? `₩${(n / 1_000_000).toFixed(1)}M` : `₩${n.toLocaleString()}`;

  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold tracking-tight">Recent orders</h3>
        <Link href="/orders" className="text-xs font-semibold text-accent">View all orders →</Link>
      </div>
      <div className="space-y-0">
        {orders.map((order) => (
          <div key={order.id} className="grid grid-cols-4 py-3 border-b border-[var(--border)] last:border-b-0 text-[13px] items-center">
            <span className="font-semibold">{order.orderNumber}</span>
            <span className={order.isTransfer ? "text-accent" : "text-[var(--text-secondary)]"}>
              {order.isTransfer ? order.transferLabel : order.customerName}
            </span>
            <span><Badge status={order.status} /></span>
            <span className="font-semibold text-right">{formatWon(order.totalAmount)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 5: Write low stock alerts component**

Write `src/components/dashboard/low-stock-alerts.tsx`:

```typescript
import { Card } from "@/components/ui/card";
import Link from "next/link";

interface AlertItem {
  productName: string;
  companyName: string;
  reorderLevel: number;
  quantity: number;
}

export function LowStockAlerts({ items }: { items: AlertItem[] }) {
  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold tracking-tight">Low stock alerts</h3>
        <Link href="/inventory" className="text-xs font-semibold text-accent">Inventory →</Link>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex justify-between items-center py-2.5 border-b border-[var(--border)] last:border-b-0">
          <div>
            <div className="text-[13px] font-medium">{item.productName}</div>
            <div className="text-xs text-[var(--text-tertiary)]">{item.companyName} · Reorder at {item.reorderLevel}</div>
          </div>
          <div className="text-[13px] font-bold text-rose-500">{item.quantity} left</div>
        </div>
      ))}
    </Card>
  );
}
```

- [ ] **Step 6: Write dashboard page**

Write `src/app/dashboard/page.tsx`:

```typescript
import { prisma } from "@/lib/prisma";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { CompanyBreakdown } from "@/components/dashboard/company-breakdown";
import { RecentOrders } from "@/components/dashboard/recent-orders";
import { LowStockAlerts } from "@/components/dashboard/low-stock-alerts";
import { DateFilter } from "@/components/ui/date-filter";

export default async function DashboardPage({ searchParams }: { searchParams: { company?: string } }) {
  const companyId = searchParams.company || null;
  const companyFilter = companyId ? { companyId } : {};

  // Fetch all data in parallel
  const [orders, allInventory, companies, productionOrders] = await Promise.all([
    prisma.order.findMany({
      where: companyFilter,
      take: 5,
      orderBy: { orderDate: "desc" },
      include: {
        customer: { select: { name: true } },
        company: { select: { name: true } },
        transfer: { include: { fromCompany: { select: { name: true } }, toCompany: { select: { name: true } } } },
      },
    }),
    prisma.inventory.findMany({
      where: companyFilter,
      include: {
        product: { select: { name: true, costPrice: true } },
        company: { select: { name: true } },
      },
      orderBy: { quantity: "asc" },
    }),
    prisma.company.findMany({ select: { id: true, name: true } }),
    prisma.productionOrder.count({ where: { ...companyFilter, status: { in: ["PLANNED", "IN_PROGRESS"] } } }),
  ]);

  // Low stock: filter in app code (Prisma can't compare two columns)
  const lowStock = allInventory.filter((inv) => inv.quantity <= inv.reorderLevel).slice(0, 5);

  // Inventory value: sum(quantity * cost_price) across all inventory
  const inventoryValue = allInventory.reduce((sum, inv) => sum + inv.quantity * Number(inv.product.costPrice), 0);

  // KPIs
  const totalSales = await prisma.order.aggregate({
    where: { ...companyFilter, type: { in: ["SALE", "BROKERAGE"] } },
    _sum: { totalAmount: true },
  });

  const openOrders = await prisma.order.count({
    where: { ...companyFilter, status: { in: ["PENDING", "PROCESSING", "SHIPPED"] } },
  });

  const pendingShipments = await prisma.order.count({
    where: { ...companyFilter, status: "PROCESSING" },
  });

  // Per-company breakdown
  const companyBreakdowns = await Promise.all(
    companies.map(async (c) => {
      const revenue = await prisma.order.aggregate({
        where: { companyId: c.id, type: { in: ["SALE", "BROKERAGE"] } },
        _sum: { totalAmount: true },
      });
      const orderCount = await prisma.order.count({ where: { companyId: c.id } });
      return { ...c, revenue: Number(revenue._sum.totalAmount || 0), orderCount };
    })
  );

  const formatWon = (n: number) => {
    if (n >= 1_000_000_000) return `₩${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000) return `₩${(n / 1_000_000).toFixed(1)}M`;
    return `₩${n.toLocaleString()}`;
  };

  return (
    <div>
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-accent bg-accent/[0.08] rounded-full mb-3">
            <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
            Live overview
          </div>
          <h1 className="text-3xl font-bold tracking-tighter">
            {companyId ? companies.find((c) => c.id === companyId)?.name : "Group"} dashboard
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {companyId ? "" : "HanahOne Group — consolidated across all entities"}
          </p>
        </div>
        <DateFilter />
      </div>

      <div className="space-y-4">
        <KpiRow data={{
          totalSales: Number(totalSales._sum.totalAmount || 0),
          openOrders,
          inventoryValue,
          productionRuns: productionOrders,
          salesChange: 0, // Requires previous period comparison — computed from date-filtered queries
          pendingShipments,
          lowStockCount: lowStock.length,
          newProductionRuns: 0, // Requires date-filtered query on production orders created this week
        }} />

        {!companyId && (
          <CompanyBreakdown companies={companyBreakdowns.map((c) => ({
            name: c.name,
            color: c.name === "HOI" ? "#0d9488" : c.name === "HOK" ? "#6366f1" : "#d97706",
            stats: [
              { label: "Revenue", value: formatWon(c.revenue) },
              { label: "Orders", value: c.orderCount.toString() },
            ],
          }))} />
        )}

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-8">
            <RecentOrders orders={orders.map((o) => ({
              id: o.id,
              orderNumber: o.orderNumber,
              customerName: o.customer?.name || "—",
              status: o.status,
              totalAmount: Number(o.totalAmount),
              isTransfer: o.type === "INTER_COMPANY",
              transferLabel: o.transfer ? `${o.transfer.fromCompany.name} → ${o.transfer.toCompany.name} (transfer)` : undefined,
            }))} />
          </div>
          <div className="col-span-4">
            <LowStockAlerts items={lowStock.map((inv) => ({
              productName: inv.product.name,
              companyName: inv.company.name,
              reorderLevel: inv.reorderLevel,
              quantity: inv.quantity,
            }))} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add dashboard page with KPIs, company breakdown, orders, alerts"
```

---

## Task 10: List Pages — Orders, Products, Inventory, Customers

**Files:**
- Create: `src/app/orders/page.tsx`, `src/app/products/page.tsx`, `src/app/inventory/page.tsx`, `src/app/customers/page.tsx`, `src/app/sales/page.tsx`

Each page is a **server component** that reads `searchParams.company` to get the selected company ID (synced from the client-side CompanySwitcher via URL params). Pattern:

```typescript
export default async function SomePage({ searchParams }: { searchParams: { company?: string } }) {
  const companyFilter = searchParams.company ? { companyId: searchParams.company } : {};
  const data = await prisma.someModel.findMany({ where: companyFilter, ... });
  // render with Card + DataTable
}
```

- [ ] **Step 1: Write orders list page**

Write `src/app/orders/page.tsx`:
- Read `searchParams.company` for company filter
- Fetch orders with `prisma.order.findMany({ where: { ...companyFilter }, include: { customer, company, items } })`
- Render in Card with DataTable: columns = Order#, Customer, Type, Status (Badge), Amount, Date
- Add type filter buttons (All, Sale, Purchase, Brokerage, Inter-Company)

- [ ] **Step 2: Write products list page**

Write `src/app/products/page.tsx`:
- Fetch products with company filter, include company name
- DataTable columns: SKU, Name, Category, Base Price, Cost Price, Company
- "Add product" button opening inline form

- [ ] **Step 3: Write inventory list page**

Write `src/app/inventory/page.tsx`:
- Fetch all inventory with company filter, include product and company
- Filter in app code: highlight rows where `quantity <= reorderLevel` with rose text
- DataTable columns: Product, SKU, Warehouse, Quantity, Reorder Level, Company

- [ ] **Step 4: Write customers list page**

Write `src/app/customers/page.tsx`:
- Fetch customers with company filter
- DataTable columns: Name, Type (Badge), Contact, Company
- Type filter buttons (All, Individual, Drugstore, Wholesale)

- [ ] **Step 5: Write sales page**

Write `src/app/sales/page.tsx`:
- Fetch orders where `type: "SALE"` with company filter
- Show total revenue aggregate at top
- DataTable same as orders page but pre-filtered to sales

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add list pages for orders, products, inventory, customers, sales"
```

---

## Task 11: Detail Pages + CRUD Forms

**Files:**
- Create: `src/app/orders/[id]/page.tsx`, `src/app/products/[id]/page.tsx`, `src/app/customers/[id]/page.tsx`, `src/app/transfers/page.tsx`, `src/app/transfers/[id]/page.tsx`

- [ ] **Step 1: Write order detail page** — order info, items list, status transition buttons, inter-company transfer details if applicable.

- [ ] **Step 2: Write product detail/edit page** — editable fields for name, SKU, prices, category.

- [ ] **Step 3: Write customer detail page** — contact info, order history.

- [ ] **Step 4: Write transfers list page** — all inter-company transfers with from/to companies, status.

- [ ] **Step 5: Write transfer detail page** — transfer info, linked order items, receive confirmation button.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add detail pages for orders, products, customers, transfers"
```

---

## Task 12: Manufacturing + Consulting Pages

**Files:**
- Create: `src/app/manufacturing/page.tsx`, `src/app/manufacturing/[id]/page.tsx`, `src/app/consulting/page.tsx`

- [ ] **Step 1: Write manufacturing list page** — production orders for HOK, status badges, progress bars.

- [ ] **Step 2: Write manufacturing detail page** — production order details, status transitions, BOM display, update quantity produced.

- [ ] **Step 3: Write consulting page** — HOR consulting engagements list with status, client, billing.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add manufacturing and consulting pages"
```

---

## Task 13: Reports Page + API

**Files:**
- Create: `src/app/reports/page.tsx`, `src/app/api/reports/route.ts`

- [ ] **Step 1: Write reports API** — `/api/reports?type=X&company=Y&from=Z&to=W&format=json|csv|xlsx`

Supported report types (all respect company filter, group view excludes INTER_COMPANY to avoid double-counting):
- `sales-by-period` — revenue grouped by day/week/month/quarter
- `top-products` — products ranked by revenue and volume
- `order-fulfillment` — fulfillment rate (delivered / total orders)
- `inventory-levels` — current stock with aging (days since last movement)
- `customer-breakdown` — sales per customer
- `production-efficiency` — HOK only: planned vs actual quantity, completion rate
- `manufacturing-output` — HOK only: output grouped by product
- `raw-material-consumption` — HOK only: BOM * production orders completed
- `consulting-revenue` — HOR only: revenue grouped by drugstore client
- `brokerage-margins` — HOR only: brokerage volume, cost, margin per order

- [ ] **Step 2: Write reports page** — report hub with selectable report type, date range picker, company filter from searchParams. Renders data in Card with DataTable. Shows only relevant reports based on selected company (HOK reports hidden when viewing HOI, etc.).

- [ ] **Step 3: Add CSV + Excel export** — `/api/reports?format=csv` returns CSV download. `/api/reports?format=xlsx` returns Excel download. Install `exceljs` for XLSX generation: `npm install exceljs`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add reports page with sales, inventory, and production reports + CSV export"
```

---

## Task 14: Settings + User Management

**Files:**
- Create: `src/app/settings/page.tsx`

- [ ] **Step 1: Write settings page** — user list (ADMIN only), create user form, company assignment, role selection.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add settings page with user management"
```

---

## Task 15: Integration Testing + Final Polish

- [ ] **Step 1: Run all unit tests**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Manual smoke test** — start dev server, log in, switch companies, navigate all pages, create an order, verify inventory deduction.

```bash
npx prisma db push
npx prisma db seed
npm run dev
```

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: fix integration issues and final polish"
```
