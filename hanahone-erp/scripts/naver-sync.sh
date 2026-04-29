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
#    Origin products (12xxx Naver product number) work via GET → patch
#    stockQuantity → PUT. Channel-products and option products are still
#    skipped (failed=N in the log) — those need a separate endpoint and
#    will be added later. Failures here don't fail the script.
npx tsx scripts/naver-push-stock.ts 2>&1 | tee -a /tmp/naver-sync.log || true

# 3) Pull Coupang orders (marketplace + rocket growth) and rocket growth inventory.
#    Coupang's IP whitelist also requires running from the home IP.
npx tsx scripts/coupang-sync.ts 2>&1 | tee -a /tmp/naver-sync.log || true
