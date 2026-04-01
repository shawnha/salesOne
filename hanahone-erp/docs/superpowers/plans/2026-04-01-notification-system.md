# Notification System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-app + Telegram notifications for sync failures, low stock, and new orders.

**Architecture:** NotificationService writes to a Notification DB table and dispatches to Telegram Bot API for URGENT alerts. TopNav gets a bell icon with unread count (RSC-driven). Dashboard gets a System Alerts card. Cron routes trigger notifications after sync completes.

**Tech Stack:** Next.js 14 (RSC + API routes), Prisma, Telegram Bot API (fetch), Tailwind CSS

---

### Task 1: Prisma Notification Model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add Notification model to schema**

Add at the end of `prisma/schema.prisma`:

```prisma
model Notification {
  id        String   @id @default(uuid())
  type      String   // SYNC_FAILED, LOW_STOCK, NEW_ORDERS
  priority  String   // URGENT, NORMAL
  title     String
  message   String
  data      Json?
  companyId String?
  company   Company? @relation(fields: [companyId], references: [id])
  sentVia   String?  // "telegram", "slack", null
  readAt    DateTime?
  sentAt    DateTime?
  createdAt DateTime @default(now())

  @@index([createdAt(sort: Desc)])
  @@index([readAt])
}
```

Also add to the Company model's relations:

```prisma
notifications Notification[]
```

- [ ] **Step 2: Run migration**

Run: `npx prisma migrate dev --name add-notification-model`
Expected: Migration created and applied successfully.

- [ ] **Step 3: Verify generated client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add prisma/ && git commit -m "feat: add Notification model for alerts system"
```

---

### Task 2: NotificationService Core

**Files:**
- Create: `src/lib/notifications/index.ts`
- Test: `__tests__/lib/notifications.test.ts`

- [ ] **Step 1: Write failing tests for send()**

Create `__tests__/lib/notifications.test.ts`:

```typescript
import { prisma } from "@/lib/prisma";

// Mock telegram before importing notify
jest.mock("@/lib/notifications/telegram", () => ({
  sendTelegram: jest.fn().mockResolvedValue(true),
}));

import * as notify from "@/lib/notifications";
import { sendTelegram } from "@/lib/notifications/telegram";

describe("NotificationService", () => {
  afterEach(async () => {
    await prisma.notification.deleteMany();
  });

  it("send() creates DB record", async () => {
    await notify.send({
      type: "SYNC_FAILED",
      priority: "URGENT",
      title: "CGETC Sync Failed",
      message: "Connection timeout",
    });
    const all = await prisma.notification.findMany();
    expect(all).toHaveLength(1);
    expect(all[0].type).toBe("SYNC_FAILED");
    expect(all[0].priority).toBe("URGENT");
  });

  it("send() URGENT calls telegram", async () => {
    await notify.send({
      type: "SYNC_FAILED",
      priority: "URGENT",
      title: "Test",
      message: "Test msg",
    });
    expect(sendTelegram).toHaveBeenCalledWith("Test", "Test msg");
  });

  it("send() NORMAL does NOT call telegram", async () => {
    (sendTelegram as jest.Mock).mockClear();
    await notify.send({
      type: "NEW_ORDERS",
      priority: "NORMAL",
      title: "5 New Orders",
      message: "Naver",
    });
    expect(sendTelegram).not.toHaveBeenCalled();
  });

  it("send() skips duplicate LOW_STOCK within 24h", async () => {
    await notify.send({
      type: "LOW_STOCK",
      priority: "URGENT",
      title: "Low Stock: Refill-pack",
      message: "248 remaining",
    });
    (sendTelegram as jest.Mock).mockClear();
    await notify.send({
      type: "LOW_STOCK",
      priority: "URGENT",
      title: "Low Stock: Refill-pack",
      message: "248 remaining",
    });
    const all = await prisma.notification.findMany();
    expect(all).toHaveLength(1); // no duplicate
    expect(sendTelegram).not.toHaveBeenCalled();
  });

  it("getUnread() returns unread notifications", async () => {
    await prisma.notification.create({
      data: { type: "SYNC_FAILED", priority: "URGENT", title: "A", message: "a" },
    });
    await prisma.notification.create({
      data: { type: "NEW_ORDERS", priority: "NORMAL", title: "B", message: "b", readAt: new Date() },
    });
    const unread = await notify.getUnread();
    expect(unread).toHaveLength(1);
    expect(unread[0].title).toBe("A");
  });

  it("markRead() sets readAt", async () => {
    const n = await prisma.notification.create({
      data: { type: "SYNC_FAILED", priority: "URGENT", title: "A", message: "a" },
    });
    await notify.markRead(n.id);
    const updated = await prisma.notification.findUnique({ where: { id: n.id } });
    expect(updated?.readAt).not.toBeNull();
  });

  it("markAllRead() sets readAt on all unread", async () => {
    await prisma.notification.create({
      data: { type: "SYNC_FAILED", priority: "URGENT", title: "A", message: "a" },
    });
    await prisma.notification.create({
      data: { type: "NEW_ORDERS", priority: "NORMAL", title: "B", message: "b" },
    });
    await notify.markAllRead();
    const all = await prisma.notification.findMany();
    expect(all.every((n) => n.readAt !== null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/lib/notifications.test.ts --no-coverage`
Expected: FAIL — module `@/lib/notifications` not found

- [ ] **Step 3: Implement NotificationService**

Create `src/lib/notifications/index.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { sendTelegram } from "./telegram";

export type NotificationType = "SYNC_FAILED" | "LOW_STOCK" | "NEW_ORDERS";
export type NotificationPriority = "URGENT" | "NORMAL";

export async function send(params: {
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  data?: Record<string, any>;
  companyId?: string;
}): Promise<void> {
  // Dedup: skip LOW_STOCK with same title within 24h
  if (params.type === "LOW_STOCK") {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await prisma.notification.findFirst({
      where: {
        type: "LOW_STOCK",
        title: params.title,
        createdAt: { gte: twentyFourHoursAgo },
      },
    });
    if (existing) return;
  }

  const notification = await prisma.notification.create({
    data: {
      type: params.type,
      priority: params.priority,
      title: params.title,
      message: params.message,
      data: params.data ?? undefined,
      companyId: params.companyId,
    },
  });

  // URGENT → dispatch to telegram
  if (params.priority === "URGENT") {
    const success = await sendTelegram(params.title, params.message);
    if (success) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: { sentAt: new Date(), sentVia: "telegram" },
      });
    }
  }
}

export async function getUnread(limit = 20): Promise<any[]> {
  return prisma.notification.findMany({
    where: { readAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getRecent(limit = 20): Promise<any[]> {
  return prisma.notification.findMany({
    orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
    take: limit,
  });
}

export async function markRead(id: string): Promise<void> {
  await prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(): Promise<void> {
  await prisma.notification.updateMany({
    where: { readAt: null },
    data: { readAt: new Date() },
  });
}

export async function getUnreadCount(): Promise<number> {
  return prisma.notification.count({
    where: { readAt: null },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/lib/notifications.test.ts --no-coverage`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/index.ts __tests__/lib/notifications.test.ts
git commit -m "feat: add NotificationService with send, getUnread, markRead"
```

---

### Task 3: Telegram Integration

**Files:**
- Create: `src/lib/notifications/telegram.ts`
- Test: `__tests__/lib/notifications-telegram.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/notifications-telegram.test.ts`:

```typescript
import { sendTelegram } from "@/lib/notifications/telegram";

// Save original env
const originalEnv = { ...process.env };

describe("sendTelegram", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it("returns false when env vars missing", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    const result = await sendTelegram("Title", "Message");
    expect(result).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends message and returns true on success", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "test-chat";
    (fetch as jest.Mock).mockResolvedValue({ ok: true });

    const result = await sendTelegram("Alert Title", "Alert message");
    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
    const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.chat_id).toBe("test-chat");
    expect(body.text).toContain("Alert Title");
  });

  it("returns false on API failure without throwing", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "test-chat";
    (fetch as jest.Mock).mockResolvedValue({ ok: false, status: 403 });

    const result = await sendTelegram("Title", "Message");
    expect(result).toBe(false);
  });

  it("returns false on network error without throwing", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "test-chat";
    (fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

    const result = await sendTelegram("Title", "Message");
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/lib/notifications-telegram.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement telegram.ts**

Create `src/lib/notifications/telegram.ts`:

```typescript
export async function sendTelegram(title: string, message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return false;
  }

  const text = `*${escapeMarkdown(title)}*\n${escapeMarkdown(message)}`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "MarkdownV2",
      }),
    });

    if (!res.ok) {
      console.error(`Telegram API error: ${res.status}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Telegram send failed:", (err as Error).message);
    return false;
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/lib/notifications-telegram.test.ts --no-coverage`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/telegram.ts __tests__/lib/notifications-telegram.test.ts
git commit -m "feat: add Telegram Bot API integration for notifications"
```

---

### Task 4: Cron Route Notification Triggers

**Files:**
- Modify: `src/app/api/cron/cgetc-sync/route.ts`
- Modify: `src/app/api/cron/naver-sync/route.ts`

- [ ] **Step 1: Add notification triggers to CGETC cron**

Edit `src/app/api/cron/cgetc-sync/route.ts`. Add import at top:

```typescript
import * as notify from "@/lib/notifications";
```

After `const result = await runSync(...)` and before the return statements, add:

```typescript
  // --- Notifications ---
  if (result.errorMessage || result.recordsFailed > 0) {
    await notify.send({
      type: "SYNC_FAILED",
      priority: "URGENT",
      title: "CGETC Sync Failed",
      message: result.errorMessage || `${result.recordsFailed} records failed`,
      data: { platform: "CGETC", recordsFailed: result.recordsFailed, recordsProcessed: result.recordsProcessed },
      companyId: config.companyId,
    });
  } else if (result.recordsProcessed > 0) {
    await notify.send({
      type: "NEW_ORDERS",
      priority: "NORMAL",
      title: `${result.recordsProcessed} New Orders (CGETC)`,
      message: "Synced successfully",
      data: { platform: "CGETC", count: result.recordsProcessed },
      companyId: config.companyId,
    });
  }

  // Check low stock (raw query for field comparison)
  const lowStock = await prisma.$queryRaw<{ productName: string; quantity: number; companyId: string }[]>`
    SELECT p.name as "productName", i.quantity, i."companyId"
    FROM "Inventory" i JOIN "Product" p ON i."productId" = p.id
    WHERE i.quantity <= i."reorderLevel" AND i."reorderLevel" > 0
    AND i."companyId" = ${config.companyId}
  `;
  for (const item of lowStock) {
    await notify.send({
      type: "LOW_STOCK",
      priority: "URGENT",
      title: `Low Stock: ${item.productName}`,
      message: `${item.quantity} remaining`,
      companyId: item.companyId,
    });
  }
```

- [ ] **Step 2: Add notification triggers to Naver cron**

Edit `src/app/api/cron/naver-sync/route.ts`. Same pattern — add import and triggers after `const result = await runSync(...)`:

```typescript
import * as notify from "@/lib/notifications";
```

```typescript
  // --- Notifications ---
  if (result.errorMessage || result.recordsFailed > 0) {
    await notify.send({
      type: "SYNC_FAILED",
      priority: "URGENT",
      title: "Naver Sync Failed",
      message: result.errorMessage || `${result.recordsFailed} records failed`,
      data: { platform: "NAVER", recordsFailed: result.recordsFailed, recordsProcessed: result.recordsProcessed },
      companyId: config.companyId,
    });
  } else if (result.recordsProcessed > 0) {
    await notify.send({
      type: "NEW_ORDERS",
      priority: "NORMAL",
      title: `${result.recordsProcessed} New Orders (Naver)`,
      message: "Synced successfully",
      data: { platform: "NAVER", count: result.recordsProcessed },
      companyId: config.companyId,
    });
  }

  // Check low stock for HOK
  const lowStock = await prisma.$queryRaw<{ productName: string; quantity: number; companyId: string }[]>`
    SELECT p.name as "productName", i.quantity, i."companyId"
    FROM "Inventory" i JOIN "Product" p ON i."productId" = p.id
    WHERE i.quantity <= i."reorderLevel" AND i."reorderLevel" > 0
    AND i."companyId" = ${config.companyId}
  `;
  for (const item of lowStock) {
    await notify.send({
      type: "LOW_STOCK",
      priority: "URGENT",
      title: `Low Stock: ${item.productName}`,
      message: `${item.quantity} remaining`,
      companyId: item.companyId,
    });
  }
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit 2>&1 | grep -v "__tests__" | grep "error" | head -10`
Expected: No new errors (existing test errors only)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/cgetc-sync/route.ts src/app/api/cron/naver-sync/route.ts
git commit -m "feat: trigger notifications from cron sync routes"
```

---

### Task 5: Notifications API Routes

**Files:**
- Create: `src/app/api/notifications/route.ts`
- Create: `src/app/api/notifications/read/route.ts`

- [ ] **Step 1: Create GET /api/notifications**

Create `src/app/api/notifications/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getRecent, getUnreadCount } from "@/lib/notifications";

export async function GET() {
  const [notifications, unreadCount] = await Promise.all([
    getRecent(20),
    getUnreadCount(),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}
```

- [ ] **Step 2: Create POST /api/notifications/read**

Create `src/app/api/notifications/read/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { markRead, markAllRead } from "@/lib/notifications";
import { z } from "zod";

const ReadSchema = z.union([
  z.object({ id: z.string().uuid() }),
  z.object({ all: z.literal(true) }),
]);

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = ReadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if ("all" in parsed.data) {
    await markAllRead();
  } else {
    await markRead(parsed.data.id);
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit 2>&1 | grep -v "__tests__" | grep "error" | head -10`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/notifications/
git commit -m "feat: add notification API routes (GET list, POST read)"
```

---

### Task 6: Bell Icon + Dropdown UI

**Files:**
- Create: `src/components/nav/notification-bell.tsx`
- Modify: `src/components/nav/top-nav.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create NotificationBell client component**

Create `src/components/nav/notification-bell.tsx`:

```typescript
"use client";

import { useState, useEffect, useRef } from "react";

type Notification = {
  id: string;
  type: string;
  priority: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

const TYPE_COLORS: Record<string, string> = {
  SYNC_FAILED: "bg-red-500",
  LOW_STOCK: "bg-amber-500",
  NEW_ORDERS: "bg-blue-500",
};

export function NotificationBell({ initialCount }: { initialCount: number }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleOpen() {
    setOpen(!open);
    if (!open) {
      setLoading(true);
      try {
        const res = await fetch("/api/notifications");
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      } catch {}
      setLoading(false);
    }
  }

  async function handleMarkAllRead() {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
  }

  async function handleMarkRead(id: string) {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setUnreadCount((c) => Math.max(0, c - 1));
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleOpen}
        className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-all duration-200 text-sm relative"
        aria-label="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-10 right-0 w-[360px] bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <h3 className="text-[13px] font-bold">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] text-accent hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-[var(--text-tertiary)] text-xs">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-[var(--text-tertiary)] text-xs">No notifications</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.readAt && handleMarkRead(n.id)}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-[var(--border)] cursor-pointer hover:bg-[var(--hover-bg-subtle)] ${
                    !n.readAt ? "bg-accent/[0.03]" : ""
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${!n.readAt ? TYPE_COLORS[n.type] || "bg-gray-400" : "bg-transparent"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold truncate">{n.title}</div>
                    <div className="text-[11px] text-[var(--text-secondary)] truncate">{n.message}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)] mt-1">{timeAgo(n.createdAt)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add unread count to layout.tsx (RSC)**

Edit `src/app/layout.tsx`. Add import:

```typescript
import { getUnreadCount } from "@/lib/notifications";
```

Inside `RootLayout`, after `const companies = ...`:

```typescript
const unreadNotifications = await getUnreadCount();
```

Pass to TopNav:

```tsx
<TopNav unreadNotifications={unreadNotifications} />
```

- [ ] **Step 3: Update TopNav to accept and render bell**

Edit `src/components/nav/top-nav.tsx`. Add import:

```typescript
import { NotificationBell } from "./notification-bell";
```

Change function signature:

```typescript
export function TopNav({ unreadNotifications = 0 }: { unreadNotifications?: number }) {
```

Add bell icon between CompanySwitcher and theme toggle (inside the right-side div):

```tsx
<CompanySwitcher />
<NotificationBell initialCount={unreadNotifications} />
<button onClick={toggleTheme} ...>
```

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit 2>&1 | grep -v "__tests__" | grep "error" | head -10`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add src/components/nav/notification-bell.tsx src/components/nav/top-nav.tsx src/app/layout.tsx
git commit -m "feat: add notification bell icon with dropdown to TopNav"
```

---

### Task 7: Dashboard System Alerts Card

**Files:**
- Create: `src/components/dashboard/system-alerts.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Create SystemAlerts component**

Create `src/components/dashboard/system-alerts.tsx`:

```typescript
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  SYNC_FAILED: { icon: "\u26A0", color: "bg-red-500/[0.08]" },
  LOW_STOCK: { icon: "\uD83D\uDCE6", color: "bg-amber-500/[0.08]" },
  NEW_ORDERS: { icon: "\uD83D\uDED2", color: "bg-blue-500/[0.08]" },
};

export async function SystemAlerts() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const alerts = await prisma.notification.findMany({
    where: { createdAt: { gte: twentyFourHoursAgo } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (alerts.length === 0) return null;

  return (
    <Card>
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-4">
        System Alerts
        <span className="ml-2 inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-500/[0.08] text-red-500">
          {alerts.filter((a) => !a.readAt).length} new
        </span>
      </div>
      <div className="space-y-0">
        {alerts.map((alert) => {
          const config = TYPE_CONFIG[alert.type] || { icon: "\u2139", color: "bg-gray-500/[0.08]" };
          return (
            <div key={alert.id} className="flex items-start gap-3 py-2.5 border-b border-[var(--border)] last:border-b-0">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[13px] flex-shrink-0 ${config.color}`}>
                {config.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold truncate">{alert.title}</div>
                <div className="text-[11px] text-[var(--text-secondary)] truncate">{alert.message}</div>
              </div>
              <span className="text-[10px] text-[var(--text-tertiary)] whitespace-nowrap">
                {new Date(alert.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Add SystemAlerts to dashboard page**

Edit `src/app/dashboard/page.tsx`. Add import:

```typescript
import { SystemAlerts } from "@/components/dashboard/system-alerts";
```

In the right column (col-span-4), add `<SystemAlerts />` above the existing `LowStockAlerts`:

```tsx
<SystemAlerts />
```

- [ ] **Step 3: Type check and visual verify**

Run: `npx tsc --noEmit 2>&1 | grep -v "__tests__" | grep "error" | head -10`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/system-alerts.tsx src/app/dashboard/page.tsx
git commit -m "feat: add System Alerts card to dashboard"
```

---

### Task 8: Environment Variables + Deploy

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Update .env.example**

Add to `.env.example`:

```
TELEGRAM_BOT_TOKEN=    # BotFather에서 발급
TELEGRAM_CHAT_ID=      # 수신 채팅방/그룹 ID
```

- [ ] **Step 2: Set Vercel env vars**

```bash
echo "TOKEN_VALUE" | npx vercel env add TELEGRAM_BOT_TOKEN production
echo "CHAT_ID_VALUE" | npx vercel env add TELEGRAM_CHAT_ID production
```

(Replace with actual values after user creates Telegram bot)

- [ ] **Step 3: Deploy**

```bash
git add .env.example
git commit -m "chore: add Telegram env vars to .env.example"
git push origin main
npx vercel deploy --prod
```

- [ ] **Step 4: Verify deployment**

Navigate to `https://hanahone-erp.vercel.app/dashboard` and check:
- Bell icon visible in nav
- System Alerts card on dashboard (may be empty until next cron run)
- Click bell → dropdown opens
