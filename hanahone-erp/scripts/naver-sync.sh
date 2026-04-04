#!/bin/bash
# Naver sync - runs locally to use home IP for Naver API whitelist
# Usage: ./scripts/naver-sync.sh

cd /Users/admin/Desktop/claude/claude_2/hanahone-erp

# Load env
set -a
source .env
set +a

npx tsx scripts/naver-sync.ts 2>&1 | tee -a /tmp/naver-sync.log
