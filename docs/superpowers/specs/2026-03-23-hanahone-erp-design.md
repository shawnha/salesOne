# HanahOne Group ERP — Design Specification

## Overview

A multi-tenant web-based ERP system for tracking sales, orders, and inventory across three companies in the HanahOne Group: HOI (mother company), HOK (subsidiary of HOI), and HOR (subsidiary of HOK). The system provides individual company views and a consolidated group-level view.

## Business context

### Company structure

- **HOI (HanahOne Inc)** — Mother company. Sells supplements direct-to-consumer (D2C). Sources inventory from HOK and external suppliers.
- **HOK (HanahOne Korea)** — Subsidiary of HOI. Manufactures and sells supplements to drugstores (B2B). Supplies HOI via inter-company transfers.
- **HOR (HanahOne Retail)** — Subsidiary of HOK. Provides consulting services to drugstores. Acts as a middleman/broker — purchases supplements on behalf of drugstores from external suppliers (and from HOK in the near future). Does not sell supplements directly.

### Inter-company relationships

- HOK manufactures and sells to HOI (inter-company inventory transfers exist)
- HOK sells directly to drugstores (B2B)
- HOR brokers supplement purchases for drugstores (currently from external suppliers, will source from HOK in the future)
- HOI and HOK have established inter-company transfer workflows

### Scale

- ~1,000 SKUs across all companies
- 5+ users need system access
- Currently tracked via spreadsheets

## Architecture

### Approach: single multi-tenant database

All three companies share one PostgreSQL database. Every business table includes a `company_id` column for filtering and group-level rollups.

**Rationale:** At this scale (~1,000 SKUs, 5+ users), a single database is the simplest approach. Consolidated reporting is a direct query (drop the company filter). Inter-company transfers are rows in the same database. One codebase, one deployment.

### Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Backend | Next.js API routes |
| ORM | Prisma |
| Database | PostgreSQL (Supabase or Neon) |
| Auth | NextAuth.js (role-based) |
| Deployment | Vercel + managed PostgreSQL |

## Data model

### Company

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| name | String | HOI, HOK, HOR |
| type | Enum | MOTHER, SUBSIDIARY |
| parent_company_id | UUID (FK, nullable) | Self-referential |

### User

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| name | String | |
| email | String (unique) | |
| password | String (hashed) | |
| role | Enum | ADMIN, MANAGER, STAFF |
| company_id | UUID (FK) | |

### Customer

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| name | String | |
| contact_info | JSON | Phone, address, email |
| type | Enum | INDIVIDUAL, DRUGSTORE, WHOLESALE |
| company_id | UUID (FK) | Which company owns this relationship |

### Product

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| name | String | |
| sku | String (unique) | |
| description | Text | |
| category | String | |
| unit_price | Decimal | |
| company_id | UUID (FK) | |

### Inventory

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| product_id | UUID (FK) | |
| company_id | UUID (FK) | |
| quantity | Integer | |
| warehouse_location | String | |
| reorder_level | Integer | Triggers low-stock alert |

Composite unique constraint on (product_id, company_id, warehouse_location).

### Order

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| order_number | String (unique) | Human-readable (e.g., ORD-4821) |
| company_id | UUID (FK) | Owning company |
| customer_id | UUID (FK, nullable) | Null for inter-company orders |
| type | Enum | SALE, PURCHASE, INTER_COMPANY |
| status | Enum | PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED |
| total_amount | Decimal | |
| order_date | DateTime | |
| ship_date | DateTime (nullable) | |
| notes | Text (nullable) | |

### OrderItem

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| order_id | UUID (FK) | |
| product_id | UUID (FK) | |
| quantity | Integer | |
| unit_price | Decimal | Price at time of order |
| subtotal | Decimal | quantity * unit_price |

### InterCompanyTransfer

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| from_company_id | UUID (FK) | |
| to_company_id | UUID (FK) | |
| order_id | UUID (FK) | Linked to Order with type=INTER_COMPANY |
| status | Enum | PENDING, SHIPPED, RECEIVED, CANCELLED |
| transfer_date | DateTime | |
| received_date | DateTime (nullable) | |

### ProductionOrder (HOK only)

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| product_id | UUID (FK) | |
| quantity_to_produce | Integer | |
| quantity_produced | Integer | Default 0 |
| status | Enum | PLANNED, IN_PROGRESS, COMPLETED, CANCELLED |
| start_date | DateTime | |
| end_date | DateTime (nullable) | |
| notes | Text (nullable) | |

### ConsultingEngagement (HOR only)

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| customer_id | UUID (FK) | Drugstore client |
| title | String | |
| status | Enum | ACTIVE, COMPLETED, PAUSED |
| start_date | DateTime | |
| end_date | DateTime (nullable) | |
| billing_amount | Decimal | |
| notes | Text (nullable) | |

## Business logic

### Sales flows

**HOI (D2C):**
1. Customer places order via system
2. Inventory reserved for order items
3. Payment recorded
4. Order status: PENDING → PROCESSING → SHIPPED → DELIVERED

**HOK (B2B + manufacturing):**
1. Drugstore order received
2. Check inventory — if insufficient, create production order
3. Inventory allocated
4. Order status: PENDING → PROCESSING → SHIPPED → DELIVERED

**HOR (brokerage):**
1. Drugstore client requests supplements
2. HOR creates PURCHASE order from supplier (future: from HOK)
3. Supplements purchased on behalf of drugstore
4. HOR records brokerage margin
5. Order passed through to drugstore

### Inter-company transfer flow

1. HOK creates an Order with type=INTER_COMPANY
2. InterCompanyTransfer record created linking from_company (HOK) to to_company (HOI)
3. HOK's inventory decremented
4. Transfer status: PENDING → SHIPPED
5. HOI confirms receipt → status: RECEIVED
6. HOI's inventory incremented

### Manufacturing flow (HOK)

1. Production order created (manual or triggered by low inventory/incoming orders)
2. Status: PLANNED → IN_PROGRESS (production begins)
3. quantity_produced updated as batches complete
4. Status: COMPLETED when quantity_produced >= quantity_to_produce
5. Finished goods added to HOK inventory

### Inventory management

- Real-time stock tracking per company per warehouse location
- Reorder level alerts when quantity drops below threshold
- Inventory adjustments logged for audit trail
- Inter-company transfers automatically update both companies' stock

## UI and navigation

### Design language

- **Vibe:** Soft structuralism — light grey (#f8f9fa) or OLED dark (#0a0a0c), white/dark cards, diffused shadows
- **Typography:** Geist font family, tight letter-spacing, tabular-nums for data
- **Cards:** Double-bezel architecture (outer shell + inner core with inset highlight)
- **Accent:** Single teal (#0d9488 light / #2dd4bf dark)
- **Light and dark mode** supported
- **Design reference files:** REDESIGN.md, SOFT.md, TASTE.md in project

### Navigation structure

**Floating pill navbar** (top, not sidebar) with company switcher as pill tabs:

- **Company switcher:** Group / HOI / HOK / HOR — filters all pages
- **Shared pages:** Dashboard, Sales, Orders, Inventory, Products, Customers, Reports, Settings
- **Company-specific pages:** Manufacturing (HOK only), Consulting (HOR only)
- **Cross-company pages:** Inter-Company Transfers

### Dashboard (per company and group)

- KPI cards: total sales, open orders, inventory value, production runs
- Company breakdown cards (group view only)
- Recent orders table
- Low stock alerts
- Date range filter (today, 7 days, 30 days, quarter)

### Role-based access control

| Role | Access |
|------|--------|
| ADMIN | All companies, Group view, Settings, user management |
| MANAGER | Own company data, reports, order management |
| STAFF | Own company data, order entry, inventory updates |

## Reporting

### Per-company reports

- Sales by period (daily, weekly, monthly, quarterly)
- Top products by revenue and volume
- Order fulfillment rate
- Inventory aging and stock levels
- Customer sales breakdown

### HOK-specific

- Production efficiency (planned vs actual)
- Manufacturing output by product
- Raw material consumption

### HOR-specific

- Consulting revenue by client
- Brokerage volume and margins

### Group-level consolidated reports

- Combined revenue across all entities
- Total inventory value
- Group-wide sales trends
- **Inter-company elimination:** Group reports exclude inter-company transactions to avoid double-counting revenue

### Export

- CSV and Excel export for all reports

## Non-functional requirements

- **Performance:** Page loads under 2 seconds for all views
- **Concurrent users:** Support 10+ simultaneous users
- **Data integrity:** Transactions for inventory updates and inter-company transfers
- **Security:** Hashed passwords, session-based auth, HTTPS
- **Backup:** Automated daily database backups via managed PostgreSQL provider
