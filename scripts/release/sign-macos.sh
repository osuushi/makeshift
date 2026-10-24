#!/bin/bash
set -euo pipefail
# CI only. Never reuse a login keychain or cache signing material.
: "${RUNNER_TEMP:?Run signing in GitHub Actions}"
keychain="$RUNNER_TEMP/makeshift-release.keychain-db"
certificate="$RUNNER_TEMP/makeshift-release.p12"
keychain_password=$(openssl rand -hex 32)
cleanup() {
  security delete-keychain "$keychain" >/dev/null 2>&1 || true
  rm -f "$certificate"
}
trap cleanup EXIT
printf '%s' "$APPLE_CERTIFICATE_P12_BASE64" | base64 --decode > "$certificate"
chmod 600 "$certificate"
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 7200 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security import "$certificate" -P "$APPLE_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$keychain"
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain"
export APPLE_SIGNING_KEYCHAIN="$keychain"
case "${1:-}" in
  app) node scripts/release/sign-app.mjs ;;
  dmg) node scripts/release/make-dmg.mjs ;;
  *) echo 'Choose app or dmg signing' >&2; exit 1 ;;
esac
