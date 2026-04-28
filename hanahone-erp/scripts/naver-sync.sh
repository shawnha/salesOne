#!/bin/bash
# Naver sync - runs locally to use home IP for Naver API whitelist
# Usage: ./scripts/naver-sync.sh

cd /Users/admin/Desktop/claude/claude_2/hanahone-erp

# Load env
set -a
source .env
set +a

# 1) Pull orders + inventory from Naver, recalc HOK inventory
npx tsx scripts/naver-sync.ts 2>&1 | tee -a /tmp/naver-sync.log

# 2) Push HOK 스마트스토어 가용 재고 → Naver
#    DISABLED 2026-04-28: Naver Commerce API V2 PUT origin-products now
#    requires detailAttribute + a different endpoint for channel/option
#    products. Needs a full rewrite (tracked separately). The pull above
#    is enough to keep ExternalInventory + dashboards accurate; the only
#    thing missing is auto-pushing our gonggu allocations back to the
#    smartstore listing.
# npx tsx scripts/naver-push-stock.ts 2>&1 | tee -a /tmp/naver-sync.log || true
