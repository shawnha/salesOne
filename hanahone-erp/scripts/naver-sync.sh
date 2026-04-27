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

# 2) Push HOK 스마트스토어 가용 재고 → Naver (after recalc settles).
#    Failures here don't fail the whole script — push is best-effort and the
#    nightly cron will retry the next day.
npx tsx scripts/naver-push-stock.ts 2>&1 | tee -a /tmp/naver-sync.log || true
