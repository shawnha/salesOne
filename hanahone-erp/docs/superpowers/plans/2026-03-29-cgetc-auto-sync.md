# CGETC Auto Sync Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate CGETC order + inventory sync via Vercel Cron Job, running daily at 02:00 KST.

**Architecture:** A new `GET /api/cron/cgetc-sync` route validates `CRON_SECRET`, looks up the active CGETC integration config, and calls the existing `runSync()`. The concurrency guard in `sync-runner.ts` is hardened to clean up stale RUNNING jobs. The CGETC connector's `since` filter is extended to also catch orders modified after `lastSyncAt` (e.g. refunds on older orders).

**Tech Stack:** Next.js 14 API Route, Vercel Cron Jobs, Prisma, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/app/api/cron/cgetc-sync/route.ts` | Create | Cron endpoint: auth, lookup, call runSync, return proper HTTP status |
| `vercel.json` | Create | Vercel cron schedule definition |
| `src/lib/integrations/sync-runner.ts` | Modify | Harden concurrency guard (stale job cleanup) |
| `src/lib/integrations/connectors/cgetc.ts` | Modify | Add `write_date` filter to catch modified orders |
| `__tests__/lib/cron-sync.test.ts` | Create | Unit tests for cron route auth + routing logic |
| `__tests__/lib/integrations/sync-runner-guard.test.ts` | Create | Unit tests for stale job cleanup logic |

---

### Task 1: Harden Concurrency Guard in sync-runner.ts

**Files:**
- Modify: `src/lib/integrations/sync-runner.ts:16-22`
- Test: `__tests__/lib/integrations/sync-runner-guard.test.ts`

The current concurrency guard does a `findFirst` for RUNNING jobs then separately creates a new RUNNING job. This has a race condition and also leaves stale RUNNING jobs if a previous run timed out (Vercel kills the function, no cleanup runs).

Fix: Before checking for RUNNING jobs, clean up any that have been running for more than 10 minutes (well beyond normal sync time). Then use the existing pattern but with the cleanup.

- [ ] **Step 1: Write the failing test for stale job cleanup**

```typescript
// __tests__/lib/integrations/sync-runner-guard.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the exported helper function directly
import { cleanupStaleJobs } from "@/lib/integrations/sync-runner";

describe("cleanupStaleJobs", () => {
  it("marks RUNNING jobs older than 10 minutes as FAILED", async () => {
    // This test will fail because cleanupStaleJobs doesn't exist yet
    expect(cleanupStaleJobs).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/integrations/sync-runner-guard.test.ts`
Expected: FAIL — `cleanupStaleJobs` is not exported

- [ ] **Step 3: Implement stale job cleanup in sync-runner.ts**

Add this function before `runSync` and export it. Then call it at the top of `runSync`.

In `src/lib/integrations/sync-runner.ts`, add after the imports (line 5):

```typescript
const STALE_JOB_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export async function cleanupStaleJobs(companyId: string, platform: string) {
  const threshold = new Date(Date.now() - STALE_JOB_THRESHOLD_MS);
  await prisma.syncJob.updateMany({
    where: {
      companyId,
      platform: platform as any,
      status: "RUNNING",
      startedAt: { lt: threshold },
    },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errorMessage: "Timed out — marked stale by cleanup",
    },
  });
}
```

Then in `runSync`, replace lines 16-22 (the concurrency guard) with:

```typescript
  // Clean up stale RUNNING jobs (e.g. from Vercel timeout)
  await cleanupStaleJobs(companyId, connector.platform);

  // Concurrency guard
  const runningJob = await prisma.syncJob.findFirst({
    where: { companyId, platform: connector.platform, status: "RUNNING" },
  });
  if (runningJob) {
    return { recordsProcessed: 0, recordsFailed: 0, errorMessage: "Sync already in progress" };
  }
```

- [ ] **Step 4: Update test with meaningful assertion**

```typescript
// __tests__/lib/integrations/sync-runner-guard.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanupStaleJobs } from "@/lib/integrations/sync-runner";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    syncJob: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

describe("cleanupStaleJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls updateMany with correct stale threshold", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    await cleanupStaleJobs("company-1", "CGETC");

    expect(prisma.syncJob.updateMany).toHaveBeenCalledWith({
      where: {
        companyId: "company-1",
        platform: "CGETC",
        status: "RUNNING",
        startedAt: { lt: new Date(now - 10 * 60 * 1000) },
      },
      data: {
        status: "FAILED",
        completedAt: expect.any(Date),
        errorMessage: "Timed out — marked stale by cleanup",
      },
    });
  });

  it("does not throw when no stale jobs exist", async () => {
    await expect(cleanupStaleJobs("company-1", "CGETC")).resolves.not.toThrow();
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/integrations/sync-runner-guard.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/integrations/sync-runner.ts __tests__/lib/integrations/sync-runner-guard.test.ts
git commit -m "fix: harden concurrency guard — clean up stale RUNNING jobs before sync"
```

---

### Task 2: Fix Stale Order Update in CGETC Connector

**Files:**
- Modify: `src/lib/integrations/connectors/cgetc.ts:134-181`

The current `fetchCgetcSaleOrders` filters by `date_order >= since`, which misses refunds/cancellations on older orders. Odoo `sale.order` has a `write_date` field that updates on any modification. We need to fetch orders where EITHER `date_order >= since` OR `write_date >= since`.

The fix is in how we filter the records after fetching from portal. Currently at line 173-178:

```typescript
for (const r of records) {
  if (since) {
    const orderTime = new Date(r.date_order || 0).getTime();
    if (orderTime < since.getTime()) continue;
  }
  batchRecords.push(r);
```

- [ ] **Step 1: Add `write_date` to the RPC fields list**

In `src/lib/integrations/connectors/cgetc.ts`, find the `fields` array in the `odooRpc` call (around line 161-164). Add `"write_date"` to the array:

```typescript
    const records = await odooRpc(credentials.url, sessionId, "sale.order", "read", [batch], {
      fields: [
        "name", "partner_id", "partner_shipping_id", "origin",
        "date_order", "amount_total", "state", "warehouse_id", "delivery_count", "order_line",
        "write_date",
      ],
    });
```

- [ ] **Step 2: Update the since filter to also check write_date**

Replace the filter block (lines 173-178) with:

```typescript
    for (const r of records) {
      if (since) {
        const orderTime = new Date(r.date_order || 0).getTime();
        const writeTime = new Date(r.write_date || 0).getTime();
        const sinceTime = since.getTime();
        // Include if created OR modified after lastSyncAt
        if (orderTime < sinceTime && writeTime < sinceTime) continue;
      }
      batchRecords.push(r);
```

- [ ] **Step 3: Verify manually that existing sync still works**

Run dev server and trigger a manual CGETC sync via the UI to confirm no regression.

Run: `npm run dev` (port 4000), navigate to integrations, click "Sync Now" for CGETC.

- [ ] **Step 4: Commit**

```bash
git add src/lib/integrations/connectors/cgetc.ts
git commit -m "fix: CGETC sync catches refunds/changes on older orders via write_date filter"
```

---

### Task 3: Create Cron API Route

**Files:**
- Create: `src/app/api/cron/cgetc-sync/route.ts`
- Test: `__tests__/lib/cron-sync.test.ts`

- [ ] **Step 1: Write failing tests for the cron route logic**

We test the auth logic and flow as a pure function (extracting the handler logic) since testing Next.js route handlers directly requires more setup.

```typescript
// __tests__/lib/cron-sync.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateCronSecret } from "@/app/api/cron/cgetc-sync/route";

describe("CGETC Cron Sync", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: "test-secret-123" };
  });

  describe("validateCronSecret", () => {
    it("returns false when no authorization header", () => {
      expect(validateCronSecret(null)).toBe(false);
    });

    it("returns false when secret does not match", () => {
      expect(validateCronSecret("Bearer wrong-secret")).toBe(false);
    });

    it("returns true when secret matches", () => {
      expect(validateCronSecret("Bearer test-secret-123")).toBe(true);
    });

    it("returns false when CRON_SECRET env is not set", () => {
      delete process.env.CRON_SECRET;
      expect(validateCronSecret("Bearer test-secret-123")).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/cron-sync.test.ts`
Expected: FAIL — `validateCronSecret` is not exported

- [ ] **Step 3: Create the cron route**

```typescript
// src/app/api/cron/cgetc-sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/integrations/sync-runner";
import { cgetcConnector } from "@/lib/integrations/connectors/cgetc";

export const maxDuration = 60;

export function validateCronSecret(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (!authHeader) return false;
  return authHeader === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!validateCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await prisma.integrationConfig.findFirst({
    where: { platform: "CGETC", isActive: true },
  });

  if (!config) {
    return NextResponse.json(
      { error: "No active CGETC integration found" },
      { status: 404 },
    );
  }

  const result = await runSync(cgetcConnector, config.companyId);

  if (result.errorMessage) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/cron-sync.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/cgetc-sync/route.ts __tests__/lib/cron-sync.test.ts
git commit -m "feat: add CGETC auto-sync cron endpoint with CRON_SECRET auth"
```

---

### Task 4: Create vercel.json and Configure Environment

**Files:**
- Create: `vercel.json`
- Modify: `.env` (local only, not committed)

- [ ] **Step 1: Create vercel.json**

```json
{
  "crons": [
    {
      "path": "/api/cron/cgetc-sync",
      "schedule": "0 17 * * *"
    }
  ]
}
```

Note: `0 17 * * *` = 17:00 UTC = 02:00 KST (UTC+9).

- [ ] **Step 2: Add CRON_SECRET to .env**

Append to `.env`:

```
CRON_SECRET=cgetc-sync-local-dev-secret
```

This is the local dev value. The production value will be set in Vercel dashboard environment variables.

- [ ] **Step 3: Verify the route works locally**

Run: `npm run dev`

Test with curl:
```bash
# Should return 401
curl -s http://localhost:4000/api/cron/cgetc-sync | head

# Should return sync result
curl -s -H "Authorization: Bearer cgetc-sync-local-dev-secret" http://localhost:4000/api/cron/cgetc-sync | head
```

- [ ] **Step 4: Commit vercel.json**

```bash
git add vercel.json
git commit -m "feat: add Vercel cron schedule for CGETC auto-sync (daily 02:00 KST)"
```

---

### Task 5: Run All Tests

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass, including the 2 new test files.

- [ ] **Step 2: Fix any failures if needed**

If any test fails, investigate and fix before proceeding.

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve test failures from cron sync implementation"
```

(Skip this step if all tests passed.)
