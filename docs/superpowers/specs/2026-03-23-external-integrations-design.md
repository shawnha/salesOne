# External Integrations — Design Specification

## Overview

Connect the HanahOne Group ERP to external sales platforms and inventory systems to automatically sync orders and stock data. Six connectors serve two companies: HOI (Shopify, Amazon, TikTok Shop, CGETC ERP) and HOK (Naver Smartstore, Pharmacy ERP). HOK inventory is auto-calculated from initial stock minus synced sales plus manual adjustments.

## Connectors

### HOI

**Shopify (Sales)**
- Shopify Admin REST API (`/admin/api/2024-01/orders.json`)
- Fetches orders since last sync timestamp
- Maps Shopify orders → HOI SALE orders + OrderItems
- Maps Shopify fulfillment status → our OrderStatus
- Sync frequency: every 15 minutes
- Credentials: API key + store URL

**Amazon SP-API (Sales)**
- Amazon Selling Partner API — Orders API
- Requires LWA (Login with Amazon) OAuth token refresh flow
- Fetches orders since last sync
- Maps Amazon order items → HOI SALE orders + OrderItems
- Sync frequency: every 15 minutes
- Credentials: seller ID, marketplace ID, refresh token, client ID, client secret

**TikTok Shop (Sales)**
- Primary: check if TikTok orders exist in CGETC ERP data — if yes, pull from there
- Secondary: OrderDesk API if CGETC doesn't have TikTok data
- Fallback: manual CSV upload from TikTok Seller Center
- CSV parser maps columns to Order model with duplicate detection via external order ID
- Future: if TikTok Partner API access is granted, swap to API connector

**CGETC ERP (Inventory + potentially TikTok sales)**
- Web-based ERP at `https://erp.cgetc.com`
- Connection info: DB `linkup2017-cgetc-master-4705026`, Partner ID `1589358`
- Login: `it@hanah1.com` / `1111`
- Authenticate via HTTP client → discover JSON API endpoints from network traffic
- Fetch inventory/stock data → map to HOI Inventory model
- May also contain TikTok order data — check during implementation
- Sync frequency: every 30 minutes

### HOK

**Naver Smartstore (Sales)**
- Naver Commerce API (`/v1/pay-order/seller/orders`)
- Credentials: placeholder — user will paste API keys in settings
- Fetches orders since last sync → maps to HOK SALE orders
- Sync frequency: every 15 minutes

**Pharmacy ERP (Sales)**
- Connect to `isu-pharmacy-dashboard.vercel.app` API
- Fetch purchase orders placed by drugstores
- Maps to HOK SALE orders
- These sales feed into HOK auto-inventory calculation
- Sync frequency: every 15 minutes

## Data Model

### IntegrationConfig

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| companyId | UUID (FK) | |
| platform | Enum | SHOPIFY, AMAZON, TIKTOK, CGETC, NAVER, PHARMACY, ORDERDESK |
| credentials | Text | AES-256 encrypted JSON blob |
| isActive | Boolean | Default false |
| syncIntervalMinutes | Int | Default 15 |
| lastSyncAt | DateTime (nullable) | |
| createdAt | DateTime | |
| updatedAt | DateTime | |

Unique constraint on (companyId, platform).

### SyncJob

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| companyId | UUID (FK) | |
| platform | Enum | Same as IntegrationConfig |
| status | Enum | RUNNING, SUCCESS, FAILED |
| startedAt | DateTime | |
| completedAt | DateTime (nullable) | |
| recordsProcessed | Int | Default 0 |
| recordsFailed | Int | Default 0 |
| errorMessage | Text (nullable) | Sanitized — no credentials |
| createdAt | DateTime | |

### ExternalOrder

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| companyId | UUID (FK) | |
| platform | Enum | Same as above |
| externalOrderId | String | Order ID from external system |
| rawData | JSON | Full response from source for debugging |
| mappedOrderId | UUID (FK, nullable) | Links to Order once mapped |
| status | Enum | PENDING, MAPPED, FAILED |
| createdAt | DateTime | |

Unique constraint on (platform, externalOrderId) for duplicate detection.

### InventorySnapshot (HOK auto-calculation)

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| companyId | UUID (FK) | |
| productId | UUID (FK) | |
| initialQuantity | Int | Set manually once |
| calculatedQuantity | Int | initial - sales + adjustments |
| lastCalculatedAt | DateTime | |
| createdAt | DateTime | |
| updatedAt | DateTime | |

Unique constraint on (companyId, productId).

### Modifications to existing models

**Order** — add field:
- `externalSource` Enum (nullable): SHOPIFY, AMAZON, TIKTOK, NAVER, PHARMACY, CGETC, ORDERDESK, null (for manual orders)

## Credential Security

1. **Encryption at rest** — `IntegrationConfig.credentials` is AES-256 encrypted before storing. Encryption key is `ENCRYPTION_KEY` environment variable, never in code or database.

2. **Never exposed to frontend** — credentials are only decrypted server-side in sync workers. Settings UI shows masked values (e.g., `sk_live_****7a3b`) and only accepts new values.

3. **No raw keys in logs** — SyncJob.errorMessage is sanitized to strip credential values.

4. **ADMIN only** — only ADMIN role users can view/update integration settings.

5. **Encryption flow:**
   - Encrypt: `plaintext → AES-256-GCM encrypt with ENCRYPTION_KEY → store ciphertext + IV + auth tag in DB`
   - Decrypt: `read from DB → AES-256-GCM decrypt with ENCRYPTION_KEY → use → discard`

## Sync Architecture

### Sync worker flow

Each connector follows the same pattern:

1. Check `IntegrationConfig` — is this platform active? Get encrypted credentials.
2. Decrypt credentials in memory.
3. Create `SyncJob` record with status=RUNNING.
4. Fetch data from external source since `lastSyncAt`.
5. For each external record:
   a. Check `ExternalOrder` for duplicate (platform + externalOrderId).
   b. If new: store raw data in `ExternalOrder`, map to `Order` + `OrderItem`, set `mappedOrderId`.
   c. If exists: skip or update if status changed.
6. Update `SyncJob` with status=SUCCESS/FAILED, records processed/failed.
7. Update `IntegrationConfig.lastSyncAt`.
8. For HOK connectors: trigger inventory recalculation.

### HOK inventory auto-calculation

Triggered after any HOK sales sync (Naver or Pharmacy) completes:

1. For each product with an `InventorySnapshot` record:
   a. Sum all HOK sales quantities from orders where `externalSource` in (NAVER, PHARMACY).
   b. Sum all manual adjustments from `InventoryAdjustment` where type in (MANUAL, PRODUCTION).
   c. Calculate: `initialQuantity - totalSales + totalAdjustments`.
   d. Update `InventorySnapshot.calculatedQuantity` and `lastCalculatedAt`.
   e. Update `Inventory.quantity` to match.
   f. Log `InventoryAdjustment` with type=SALE for audit trail.
2. Check for low stock alerts.

### Sync scheduling

- Next.js API route `/api/sync/[platform]` triggers a single sync.
- A cron job (Vercel Cron or external) calls each platform's sync endpoint at the configured interval.
- "Sync Now" button in UI calls the same endpoint on demand.

### TikTok CSV upload flow

1. User downloads CSV from TikTok Seller Center.
2. Uploads via `/settings/integrations` page.
3. Server parses CSV, creates `ExternalOrder` records.
4. Maps to `Order` + `OrderItem` with `externalSource=TIKTOK`.
5. Duplicate detection via `externalOrderId` (TikTok order number from CSV).

## UI

### Integration settings page (`/settings/integrations`)

- Grouped by company (HOI / HOK)
- Per-connector card showing:
  - Platform name and icon
  - Status: Active (green) / Not configured (grey) / Failed (red)
  - Last sync time and result
  - "Edit" button → modal with masked credential fields
  - "Sync Now" button for manual trigger
  - TikTok: "Upload CSV" button instead of API config
- Sync history table at bottom:
  - Platform, status, records processed, time, error message (if failed)

### Dashboard enhancements

- Each KPI card should indicate data freshness (e.g., "Shopify: synced 2 min ago")
- Sales data on dashboard automatically includes synced external orders

## Connector file structure

```
src/lib/integrations/
├── types.ts              # Shared types (Platform enum, SyncResult, etc.)
├── encryption.ts         # AES-256 encrypt/decrypt utilities
├── sync-runner.ts        # Generic sync orchestrator (create job, run connector, update job)
├── connectors/
│   ├── shopify.ts        # Shopify API client + order mapper
│   ├── amazon.ts         # Amazon SP-API client + order mapper
│   ├── tiktok-csv.ts     # TikTok CSV parser + order mapper
│   ├── cgetc.ts          # CGETC ERP client + inventory mapper
│   ├── naver.ts          # Naver Smartstore client + order mapper
│   └── pharmacy.ts       # Pharmacy ERP client + order mapper
├── inventory-calculator.ts  # HOK auto-inventory recalculation
└── mappers/
    └── order-mapper.ts   # Normalize external orders → our Order model
```

## Environment variables

```
ENCRYPTION_KEY=<32-byte hex string for AES-256>
SHOPIFY_STORE_URL=<optional, can be in IntegrationConfig>
AMAZON_LWA_CLIENT_ID=<optional, can be in IntegrationConfig>
```

All credentials can also be stored in `IntegrationConfig` (encrypted). Environment variables are an alternative for deployment-level secrets.
