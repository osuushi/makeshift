#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  chromium|webkit) browser="$1" ;;
  electron) browser=chromium ;;
  *) echo 'Choose chromium, webkit or electron' >&2; exit 1 ;;
esac

# A stalled runner mirror must not consume the entire UI job's time budget.
# Playwright invokes apt through sudo, so configure apt rather than Node's env.
sudo tee /etc/apt/apt.conf.d/99makeshift-ci-network >/dev/null <<'APT'
Acquire::http::Timeout "30";
Acquire::https::Timeout "30";
Acquire::Retries "2";
APT

# Keep Playwright's platform-specific dependency list authoritative.
npx --no-install playwright install-deps "$browser"
