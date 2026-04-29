# Design System — HanahOne ERP

> 운영자(셀러)가 매일 쓰는 ERP. 화려하지 않고 차분한, 데이터 우선, 한국어 가독성, 정보 위계 명확.

## Product Context

- **What this is:** HanahOne 그룹의 e-commerce ERP. 다채널 주문/재고/매출/배송/고객 통합 관리
- **Who it's for:** HanahOne 운영자 (sales@hanah1.com, shawn@hanah1.com 등). 매일 1-3시간 이상 사용
- **Space/industry:** 한국 e-commerce 셀러 운영 도구. Shopify Admin, 네이버 스마트스토어 셀러센터, 쿠팡 Wing 같은 툴들과 같은 카테고리
- **Project type:** Internal operational dashboard (multi-tenant 형태로 3개 회사 HOI/HOK/HOR 분리)

## Aesthetic Direction

- **Direction:** Calm Operational Dashboard (차분한 운영 대시보드)
- **Decoration level:** Minimal — typography + 색 의미만으로 위계 표현. 그라데이션/이모지 장식/decorative SVG 사용 안 함
- **Mood:** Stripe Dashboard / Linear / Plaid 같은 차분함. 데이터가 주인공. 화려한 hero 없음
- **Reference vibes:** Stripe Dashboard, Linear, Plaid Admin, Notion (작업 view 모드)
- **Anti-patterns 명시 (코드/디자인에서 회피):**
  - 그라데이션 배너 (Active Round v1 mockup 같은 패턴 ❌)
  - 이모지 헤더 장식 (📦 🏭 📧 같은 거 ❌)
  - 4-stat 카드 균등 그리드 (의미 무게 다른 것을 같은 무게로 보이게 함 ❌)
  - 모든 카드 균일 둥근 모서리 (의미 위계 0 ❌)
  - 색의 의미 충돌 (한 색 → 한 의미만)
  - Inter / Roboto / Arial 디스플레이 폰트로 사용 ❌

## Typography

### 폰트 스택

```css
--font-display: 'Geist', 'Pretendard', system-ui, sans-serif;
--font-body: 'Geist', 'Pretendard', system-ui, sans-serif;
--font-mono: 'Geist Mono', 'D2Coding', ui-monospace, monospace;
```

- **Geist (영문 + 숫자):** Display + body 메인. Vercel이 만든 클린한 sans. ERP 전체 톤과 잘 맞음
- **Pretendard (한국어):** Geist 다음 fallback. 한국어 가독성 메인. 변동폭 wide range (300-700)
- **Geist Mono (데이터):** 송장번호, vendorItemId, 주문번호, 환율 등 **모노스페이스 필요한 영역**. tabular-nums 자동
- **D2Coding (한국어 코드):** Geist Mono fallback. 한글 + 영문 동시 등장 시

### 스케일

| 레벨 | 크기 | 굵기 | 사용처 |
|---|---|---|---|
| **display** | 24px | 800 (extrabold) | 페이지 제목 (`<h1>`) |
| **section** | 13px | 700 (bold) | 섹션 헤더 (`<h2>`, uppercase, letter-spacing 0.06em) |
| **card-title** | 16px | 700 | 카드 제목 (`<h3>`) |
| **stat-value** | 22px | 700 | KPI 숫자 |
| **body** | 13px | 400-500 | 본문, 표 행 |
| **meta** | 11px | 500 | 보조 텍스트, 라벨 |
| **micro** | 10px | 600 | 배지 텍스트 |

> **letter-spacing 룰:** display/card-title은 `-0.02em` (tighter, 큰 글씨 톤 정리). section은 `0.06em` (uppercase 가독성).

## Color

### Light mode (기본)

```css
--bg: #f8f9fa;             /* 페이지 배경 */
--surface: #ffffff;        /* 카드/표 배경 */
--surface-2: #f1f5f9;      /* 표 헤더, hover 영역 */
--border: rgba(0,0,0,0.06);
--border-strong: rgba(0,0,0,0.1);
--text-primary: #0f1419;
--text-secondary: #536471;
--text-tertiary: #8899a6;  /* WCAG AA 미달 — 메타데이터 한정, 본문 사용 금지 */
--text-quaternary: rgba(0,0,0,0.2);
```

### Dark mode

```css
--bg: #0a0a0c;
--surface: #16161a;
--surface-2: #1f1f24;
--border: rgba(255,255,255,0.08);
--text-primary: #f0f0f0;
--text-secondary: #94a3b8;
```

### Accent (단일 brand color)

```css
--accent: #0d9488;         /* teal — primary CTA, link, focus */
--accent-dim: rgba(13,148,136,0.08);
--accent-strong: #0f766e;  /* hover */
```

> 단일 accent 원칙. 모든 primary 액션은 teal. 다른 색은 **의미** 전달 전용 (아래 semantic + channel 참조).

### Semantic palette (상태 의미)

| 의미 | text | bg | 용도 |
|---|---|---|---|
| **success / completed** | `#10b981` | `rgba(16,185,129,0.08)` | dispatch 완료, sync 성공 |
| **info / processing** | `#2563eb` | `rgba(37,99,235,0.08)` | 진행 중, dispatched 상태 |
| **warning / pending** | `#d97706` | `rgba(217,119,6,0.08)` | 대기 중, 재고 부족 |
| **danger / failed** | `#dc2626` | `rgba(220,38,38,0.08)` | dispatch 실패, 환불 |
| **neutral** | `#64748b` | `rgba(100,116,139,0.08)` | 무성, 비활성 |

CSS 변수: `--badge-{teal,amber,red,blue,indigo,slate}` + `--badge-{name}-bg` (이미 코드에 있음, 그대로 유지).

### Channel palette (채널 brand color, semantic과 분리)

| 채널 | text | bg | 비고 |
|---|---|---|---|
| **SHOPIFY** | `#1c8847` | `rgba(28,136,71,0.08)` | green-deep |
| **AMAZON** | `#ea580c` | `rgba(234,88,12,0.08)` | orange |
| **TIKTOK** | `#db2777` | `rgba(219,39,119,0.08)` | pink |
| **NAVER** | `#03C75A` | `rgba(3,199,90,0.08)` | naver brand green |
| **COUPANG** | `#ef4444` | `rgba(239,68,68,0.08)` | coupang brand red |
| **PHARMACY** | `#2563eb` | `rgba(37,99,235,0.08)` | blue (정보 색과 동일 — 약국이 신뢰 의미) |
| **CGETC** | `#6366f1` | `rgba(99,102,241,0.08)` | indigo (3PL 톤) |
| **GONGGU** | `#f43f5e` | `rgba(244,63,94,0.08)` | rose |

**중요 — 색 의미 충돌 회피 룰:**
- COUPANG (red)과 danger (red)이 같은 색. 항상 **icon prefix + 라벨** 같이 표시. red 점만 있으면 안 됨
- ROCKET_GROWTH는 COUPANG 빨강과 구분 필요. 별도 visual marker 사용:
  - **COUPANG 마켓플레이스**: red 배지 "쿠팡"
  - **ROCKET_GROWTH (쿠팡 풀필먼트)**: red 배지 + ⚡ icon prefix "⚡ 로켓그로스"
- PHARMACY (blue)와 info (blue)는 같은 색이지만 컨텍스트로 구분 (채널 컬럼 vs 상태 컬럼)

## Spacing

```css
--space-2xs: 2px;
--space-xs:  4px;
--space-sm:  8px;
--space-md:  16px;
--space-lg:  24px;
--space-xl:  32px;
--space-2xl: 48px;
```

- **Density:** Comfortable (운영자가 1시간 이상 봄 → 너무 빽빽하면 피곤)
- **카드 안 padding:** 20px (default), 14px (compact)
- **표 cell padding:** `10-12px` 세로, `14-16px` 가로

## Layout

### Grid

- **Max content width:** `1280px` (`max-w-[1400px]` from existing main wrapper, 그대로 유지)
- **Page padding:** 24px (mobile), 40px (desktop) — `mx-auto px-6 py-10`
- **Card grid:** CSS Grid `gap-4` (16px) 표준

### Border radius (의미 위계)

| 요소 | radius | 의미 |
|---|---|---|
| 작은 인라인 (badge, pill, input) | 6-8px | 가까운 UI |
| 카드, 표 | 16px | 컨테이너 |
| 모달, 큰 카드 | 20-28px | overlay 영역 |
| `rounded-full` (pill, avatar) | 9999px | 둥근 형태 |

### Tabs (필수 사용)

- 고객 발송 / 입고 / 이메일 / 이력 같은 다른 컨텍스트는 **진짜 탭**으로 분리. 탭은 view 전환 도구이지 시각 anchor 아님

### 디스플레이 위계 — 한 화면 1 hero rule

매 페이지 **첫 viewport에 1개 핵심 정보 + 1개 핵심 행동**. 4-stat 균등 카드 그리드 X. 의미 무게에 맞게 비대칭 layout.

## Motion

- **Approach:** Minimal-functional. 입출력 transitions만. scroll-driven 애니메이션 X
- **Easing:** `ease-out` (enter), `ease-in` (exit), `ease-in-out` (state)
- **Duration:** 100ms (micro), 200ms (short, 표준), 300ms (modal)

```css
transition: all 200ms ease-out;
```

장식 모션 (loading spinner, success checkmark) 외엔 모션 없음.

## Components 어휘

### 기존 (그대로 유지)

| 컴포넌트 | 위치 | 용도 |
|---|---|---|
| `Card` | `src/components/ui/card.tsx` | 표준 카드 컨테이너 |
| `Badge` | `src/components/ui/badge.tsx` | status/type 배지 (semantic palette) |
| `DataTable` | `src/components/ui/table.tsx` | 표 |
| `EmptyState` | `src/components/ui/empty-state.tsx` | 빈 상태 (title + description, 공통 사용) |
| `MonthPicker` | `src/components/ui/month-picker.tsx` | 월 선택 |
| `SearchInput` | `src/components/ui/search-input.tsx` | 검색창 |
| `Button` | `src/components/ui/button.tsx` | primary/secondary/ghost variants |
| `Pagination` | `src/components/ui/pagination.tsx` | 페이지네이션 |

### 신규 도입 어휘 (Shipping 재설계 + 향후 다른 페이지 공통)

| 컴포넌트 | 용도 | props |
|---|---|---|
| `StepRail` | 다단계 워크플로우 진행 (4-step 같은 흐름) | `steps[]`, `currentStep`, `onStepClick` |
| `ChannelSection` | 다채널 표/리스트의 채널별 sub-section. 헤더 + 자체 표/리스트 | `channel`, `count`, `summary`, `children` |
| `ChannelBadge` | 채널 레이블 배지 (Channel palette 참조) | `channel: 'NAVER'\|'COUPANG'\|...` |
| `RocketGrowthBadge` | 로켓그로스 전용 배지 (⚡ 접두 + red) | (no props) |
| `KpiCard` | 단일 KPI 표시 (라벨 + 값 + 보조). 4-stat 그리드 대체 | `label`, `value`, `subtext`, `tone?` |
| `Tabs` | 진짜 탭 (view 전환). pill 패턴 X | `tabs[]`, `activeTab`, `onChange` |
| `EmptyState` (확장) | 기존 + `action` prop 추가 | `title`, `description`, `action?` |

### 사용 가이드

- **EmptyState — feature임**: 모든 빈 상태에 title + description + action(있으면) 3요소. "데이터 없음" 같은 cold copy 금지. 운영자에게 "오늘 할 일 없음 ✓" 같은 따뜻한 카피
- **ChannelBadge — 채널 표시는 항상 컴포넌트로**: 인라인 `<span class="badge badge-naver">` 같은 거 금지. ChannelBadge로 통일
- **StepRail — current step 강조**: 균등 너비 X, 활성 step만 두드러짐

## A11y baseline

- **색 대비:** body 텍스트 4.5:1 이상 (WCAG AA). text-tertiary (`#8899a6` 3.5:1)는 메타데이터 전용
- **터치 타겟:** 44×44px 최소 (시각은 작아도 hit area 큼)
- **키보드:** Tab 순서 명확, focus ring `outline: 2px solid var(--accent)` + 2px offset
- **ARIA:** 표는 `role="table"`, 진행률은 `role="progressbar"` + `aria-valuenow`, 탭은 `role="tablist"` + `aria-selected`
- **한국어 lang:** `<html lang="ko">` 필수 (이미 적용 검증 필요 — 현재 layout.tsx는 `lang="en"` ⚠️)

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-04-29 | DESIGN.md 신규 작성 | shipping-redesign mockup v2 디자인 리뷰 결과 — DESIGN.md 부재로 ERP 일관성 위배 발견. 코드의 기존 시스템을 문서화 + 누락 결정 추가 |
| 2026-04-29 | Pretendard 추가 (한국어) | Geist는 한글 없음. system-ui fallback이라 OS 따라 다름. Pretendard로 한국어 일관성 |
| 2026-04-29 | 단일 accent 원칙 (#0d9488 teal) | 다른 색은 의미 전달 전용. 시각 일관성 + 사용자 학습 빠름 |
| 2026-04-29 | ROCKET_GROWTH 별도 visual marker | COUPANG red와 동일 색이라 ⚡ icon prefix로 구분 |
| 2026-04-29 | 신규 컴포넌트 어휘 7종 등재 | StepRail, ChannelSection, ChannelBadge, RocketGrowthBadge, KpiCard, Tabs, EmptyState(확장) |
| 2026-04-29 | `<html lang="en">` → `lang="ko"` 변경 필요 | a11y + SEO + screen reader 한국어 발음 |

## Anti-Slop Checklist

새 페이지/컴포넌트 만들 때 검증:

- [ ] 그라데이션 배경/배너 없음
- [ ] 이모지 헤더 장식 없음 (📦 🏭 📧 등)
- [ ] 4-stat 균등 그리드 아님 (의미 무게 반영)
- [ ] 한 색 → 한 의미만 (채널 색 vs status 색 컨텍스트로 구분)
- [ ] 모든 카드 균일 radius 아님 (의미별 위계)
- [ ] 첫 viewport에 1 hero (오늘의 핵심 정보)
- [ ] EmptyState specify됨 (모든 list/table)
- [ ] Loading/Error 상태 specify됨
- [ ] 모바일 viewport spec됨
- [ ] 키보드 네비게이션 spec됨
- [ ] 색 대비 4.5:1 검증
