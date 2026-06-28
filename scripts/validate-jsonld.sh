#!/usr/bin/env bash
# JSON-LD Validation Script — extracts and validates all JSON-LD blocks from a URL
# Usage: ./scripts/validate-jsonld.sh <url>
# Requires: curl, jq
set -euo pipefail

URL="${1:-http://localhost:3000}"

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required. Install with: brew install jq"
  exit 1
fi

echo "🔍 Fetching $URL ..."
HTML=$(curl -s "$URL")

# Extract all JSON-LD script blocks
COUNT=$(echo "$HTML" | grep -o 'type="application/ld+json"' | wc -l | tr -d ' ')

if [ "$COUNT" -eq 0 ]; then
  echo "⚠️  No JSON-LD blocks found on $URL"
  exit 0
fi

echo "Found $COUNT JSON-LD block(s). Validating..."

# Extract and validate each JSON-LD block
echo "$HTML" | grep -oP '(?<=<script type="application/ld\+json">).*?(?=</script>)' | while IFS= read -r block; do
  if echo "$block" | jq . >/dev/null 2>&1; then
    TYPE=$(echo "$block" | jq -r '.["@type"] // "unknown"')
    CONTEXT=$(echo "$block" | jq -r '.["@context"] // "missing"')
    echo "  ✅ Valid JSON-LD: @type=$TYPE, @context=$CONTEXT"
  else
    echo "  ❌ Invalid JSON-LD block: $(echo "$block" | head -c 80)..."
  fi
done

echo ""
echo "Validation complete. Use Google Rich Results Test for full validation:"
echo "  https://search.google.com/test/rich-results?url=$URL"
