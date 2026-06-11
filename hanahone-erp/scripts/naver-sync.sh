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

# 4) Pull Shopify orders + payouts (지급내역). OAuth client-credentials — IP 무관.
#    2026-06-11 추가: 이전엔 수동 트리거만 있어서 5/13~6/1 16일 공백 같은 사고가
#    났음. 야간 잡에 합류시켜 자동화. Failures here don't fail the script.
npx tsx scripts/shopify-sync.ts 2>&1 | tee -a /tmp/naver-sync.log || true
