#!/usr/bin/env bash
# =============================================================================
# patch-production-env.sh
# Run this ON THE PRODUCTION SERVER (not locally) to fix the atlas-backend .env
# so production auth works correctly.
#
# Usage: bash scripts/patch-production-env.sh
# Must be run from the repo root, or pass the env path as $1.
# =============================================================================

set -euo pipefail

ENV_FILE="${1:-atlas-backend/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Run from the repo root."
  exit 1
fi

echo "[patch-env] Backing up $ENV_FILE → $ENV_FILE.bak"
cp "$ENV_FILE" "$ENV_FILE.bak"

# ── Helper: replace or append a key=value in the env file ──────────────────
set_env() {
  local key="$1"
  local value="$2"
  # Escape special characters in value for sed
  local escaped_value
  escaped_value=$(printf '%s\n' "$value" | sed 's/[[\.*^$()+?{|]/\\&/g')

  if grep -qE "^#?[[:space:]]*${key}=" "$ENV_FILE"; then
    # Uncomment if commented, then set the value
    sed -i -E "s|^#?[[:space:]]*${key}=.*|${key}=${escaped_value}|" "$ENV_FILE"
    echo "[patch-env] SET  $key"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
    echo "[patch-env] ADD  $key"
  fi
}

# ── 1. Fix NEXTAUTH_URL and AUTH_URL (must NOT point to localhost) ──────────
set_env "NEXTAUTH_URL" "https://obsidianatlastech.com"
set_env "AUTH_URL"     "https://obsidianatlastech.com"
set_env "APP_URL"      "https://obsidianatlastech.com"

# ── 2. Ensure HOST is bound to all interfaces ──────────────────────────────
set_env "HOST" "0.0.0.0"

# ── 3. CORS origins ───────────────────────────────────────────────────────
set_env "CORS_ORIGINS" "https://obsidianatlastech.com,https://www.obsidianatlastech.com"

# ── 4. Google OAuth + secrets ─────────────────────────────────────────────
# These must already exist in your .env (possibly commented out).
# The script will uncomment them. If they are blank, fill them manually.
for key in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET NEXTAUTH_SECRET AUTH_SECRET; do
  # Only uncomment — do NOT overwrite existing non-blank values
  if grep -qE "^#[[:space:]]*${key}=.+" "$ENV_FILE"; then
    sed -i -E "s|^#[[:space:]]*(${key}=.+)|\1|" "$ENV_FILE"
    echo "[patch-env] UNCOMMENTED  $key"
  else
    echo "[patch-env] SKIP $key (already set or blank — fill manually)"
  fi
done

# ── 5. Verify nothing critical is localhost ────────────────────────────────
echo ""
echo "=== Verification ==="
grep -E "^(NEXTAUTH_URL|AUTH_URL|APP_URL|HOST|CORS_ORIGINS|GOOGLE_CLIENT_ID|NEXTAUTH_SECRET|AUTH_SECRET)=" "$ENV_FILE" || true

echo ""
echo "[patch-env] Done. Restart the backend: pm2 restart all"
echo "[patch-env] If GOOGLE_CLIENT_ID / NEXTAUTH_SECRET are still blank, fill them from your previous .env.bak"
