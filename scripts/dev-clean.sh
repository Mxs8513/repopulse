#!/usr/bin/env bash
set -euo pipefail
echo "Stopping any running Next.js dev servers…"
pkill -f "next dev" || true
sleep 1
echo "Removing .next/dev/lock if present…"
rm -f .next/dev/lock || true
echo "Starting dev server…"
npm run dev

