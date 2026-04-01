# Notification System Design

## Overview

HanahOne ERP 알림 시스템. 3가지 이벤트(Sync 실패, Low stock, 새 주문)를 인앱 + 텔레그램으로 발송. Slack은 phase 2.

## Alert Types & Priority

| Type | Trigger | Priority | Channels |
|------|---------|----------|----------|
| SYNC_FAILED | Cron sync job fails (recordsFailed > 0 or errorMessage) | URGENT → 즉시 | 인앱 + 텔레그램 |
| LOW_STOCK | Inventory quantity ≤ reorderLevel after sync | URGENT → 즉시 | 인앱 + 텔레그램 |
| NEW_ORDERS | New orders synced (count > 0) | NORMAL → 인앱만 | 인앱 |

## Architecture

```
Cron Job (02:00/03:00 KST)
    ↓
sync-runner.ts / cron route
    ↓ (sync 완료 후)
NotificationService.send({ type, priority, data })
    ↓
┌─────────────────────┬─────────────────────┐
│  DB: Notification    │  Telegram Bot API   │
│  (인앱 알림 저장)     │  (URGENT만 즉시)     │
└─────────────────────┴─────────────────────┘
    ↓                       ↓
  벨 아이콘 드롭다운       모바일 푸시
  대시보드 Alerts 카드
```

## Database Model

### Notification

```prisma
model Notification {
  id        String   @id @default(uuid())
  type      String   // SYNC_FAILED, LOW_STOCK, NEW_ORDERS
  priority  String   // URGENT, NORMAL
  title     String
  message   String
  data      Json?    // { platform, recordsFailed, errorMessage, ... }
  companyId String?
  company   Company? @relation(fields: [companyId], references: [id])
  sentVia   String?  // "telegram", "slack", null (인앱 only)
  readAt    DateTime?
  sentAt    DateTime? // 외부 채널 발송 성공 시각 (null = 미발송 or 실패)
  createdAt DateTime @default(now())

  @@index([createdAt(sort: Desc)])
  @@index([readAt])
}
```

- 보존: 30일 이후 자동 삭제 (cron or on-read cleanup)

## NotificationService (`src/lib/notifications/`)

### 파일 구조

```
src/lib/notifications/
  index.ts          — types + send(), getUnread(), markRead()
  telegram.ts       — sendTelegram()
```

### API

```typescript
// index.ts
type NotificationType = "SYNC_FAILED" | "LOW_STOCK" | "NEW_ORDERS";
type NotificationPriority = "URGENT" | "NORMAL";

async function send(params: {
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  data?: Record<string, any>;
  companyId?: string;
}): Promise<void>

async function getUnread(limit?: number): Promise<Notification[]>

async function markRead(id: string): Promise<void>

async function markAllRead(): Promise<void>
```

### send() 로직

1. 중복 체크: LOW_STOCK인 경우, 같은 title로 24시간 내 기존 알림 있으면 skip
2. DB에 Notification INSERT
3. priority === URGENT → 텔레그램 발송 시도
   - 성공: sentAt = now(), sentVia = "telegram"
   - 실패: sentAt = null, sentVia = null (console.error만, throw 안 함)
4. priority === NORMAL → DB에만 저장

### telegram.ts

```typescript
async function sendTelegram(title: string, message: string): Promise<boolean> {
  // POST https://api.telegram.org/bot{TOKEN}/sendMessage
  // chat_id, text (markdown), parse_mode: "MarkdownV2"
  // 환경변수 없으면 return false (skip)
  // API 실패 시 console.error + return false (throw 안 함)
  // 성공 시 return true
}
```

## 알림 트리거 위치

### 1. Sync 실패 (`src/app/api/cron/cgetc-sync/route.ts`, `naver-sync/route.ts`)

Cron route의 sync 완료 후:
```
if (result.errorMessage || result.recordsFailed > 0) {
  await notify.send({
    type: "SYNC_FAILED",
    priority: "URGENT",
    title: `${platform} Sync Failed`,
    message: result.errorMessage || `${result.recordsFailed} records failed`,
    data: { platform, recordsFailed: result.recordsFailed, recordsProcessed: result.recordsProcessed },
    companyId,
  });
}
```

### 2. Low Stock (cron route 내, sync 완료 후)

Raw query로 필드 간 비교 (Prisma 제한 우회):
```
const lowStock = await prisma.$queryRaw<{id: string, productName: string, quantity: number, companyId: string}[]>`
  SELECT i.id, p.name as "productName", i.quantity, i."companyId"
  FROM "Inventory" i JOIN "Product" p ON i."productId" = p.id
  WHERE i.quantity <= i."reorderLevel" AND i."reorderLevel" > 0
`;
```
- 중복 방지: 같은 title로 24시간 내 이미 발송된 LOW_STOCK이 있으면 skip (send() 내부에서 처리)

### 3. 새 주문 (cron route, sync 완료 후)

```
if (result.recordsProcessed > 0) {
  await notify.send({
    type: "NEW_ORDERS",
    priority: "NORMAL",
    title: `${result.recordsProcessed} New Orders (${platform})`,
    message: `Synced successfully`,
    data: { platform, count: result.recordsProcessed },
    companyId,
  });
}
```

## 인앱 UI

### 1. 알림 벨 (TopNav)

- `src/components/nav/top-nav.tsx`에 벨 아이콘 추가
- **Unread count**: RSC 레이아웃에서 서버 사이드로 count 조회 → TopNav에 prop 전달 (페이지 이동 시 자동 갱신)
- 클릭 시 드롭다운: 최근 알림 10개
- 각 항목: dot(색상별 — red:SYNC_FAILED, amber:LOW_STOCK, blue:NEW_ORDERS) + 제목 + 설명 + 시간
- "Mark all read" 링크
- 드롭다운 내 항목 클릭 시 markRead API 호출

### 2. 대시보드 System Alerts 카드

- `src/components/dashboard/system-alerts.tsx`
- 대시보드 오른쪽 컬럼, Low Stock 위에 배치
- 최근 24시간 알림 표시 (서버 컴포넌트)
- URGENT는 빨간/주황 아이콘, NORMAL은 파란 아이콘

### 3. API Routes

```
GET  /api/notifications          — 알림 목록 (unread 우선, limit 20)
POST /api/notifications/read     — { id } or { all: true }
```

## 환경변수

```
TELEGRAM_BOT_TOKEN=   # BotFather에서 발급
TELEGRAM_CHAT_ID=     # 수신 채팅방/그룹 ID
```

## 테스트 계획

### notifications.test.ts
1. send() — DB INSERT 정상 동작
2. send() URGENT — telegram 호출 확인
3. send() NORMAL — telegram 미호출 확인
4. send() 중복 방지 — 24h 내 같은 LOW_STOCK skip

### telegram.test.ts
5. sendTelegram() — 정상 발송 (fetch mock)
6. sendTelegram() — 환경변수 없을 때 return false
7. sendTelegram() — API 실패 시 throw 안 함, return false

### notifications API route
8. GET /api/notifications — unread 우선 정렬
9. POST /api/notifications/read — readAt 업데이트
10. POST /api/notifications/read all — 전체 읽음 처리

## 구현 순서

1. Prisma 모델 + migration
2. NotificationService (send, telegram) + 테스트
3. Cron route에 트리거 삽입
4. 인앱 API routes + 테스트
5. 벨 아이콘 + 드롭다운 UI (TopNav)
6. 대시보드 System Alerts 카드
7. 환경변수 설정 + 배포

## NOT in scope (phase 2)

- 일일 요약 cron (`/api/cron/daily-summary`) — URGENT 먼저, 요약은 실사용 후 판단
- Slack 연동 — workspace 준비 후
- 알림 설정 페이지 — 채널별/타입별 on/off
- 이메일 연동 — Resend/SendGrid

## 미래 확장

- Slack: `sendSlack()` 추가 (Webhook URL)
- 일일 요약 cron: 09:00 KST 텔레그램 발송
- 알림 설정 페이지: 채널별/타입별 on/off
- 이메일: Resend/SendGrid 연동
