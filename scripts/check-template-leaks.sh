#!/usr/bin/env bash
# Template-leak check — scans built/rendered content for unresolved template variables.
# Runs in CI and as a pre-push hook. Fails if it finds patterns like:
#   pricing.fairUseNote  /  ${something}  /  {{something}}  /  %something%
# in .ts/.tsx source files (excluding comments and type definitions).
#
# Usage: bash scripts/check-template-leaks.sh

set -euo pipefail

echo "🔍 Scanning for unresolved template variables in source..."

# Patterns that indicate a leaked template variable in rendered content
# Only match template-like syntax: {{var}}, ${var}, %var%, or {var} in string literals
PATTERNS=(
  '\$\{[a-zA-Z_]+\}'
  '\{\{[a-zA-Z_]+\}\}'
  '%[a-zA-Z_]+%'
  '\{[a-zA-Z_]+\.[a-zA-Z_]+\}'
)

FOUND=0

for pattern in "${PATTERNS[@]}"; do
  # Search in src/ for the pattern, excluding node_modules and .next
  # Only check .ts and .tsx files, skip import/type/interface lines
  matches=$(grep -rn --include='*.ts' --include='*.tsx' "$pattern" src/ 2>/dev/null | \
    grep -v 'node_modules' | \
    grep -v '\.next' | \
    grep -v '^\s*//' | \
    grep -v '^\s*\*' | \
    grep -v 'import ' | \
    grep -v 'type ' | \
    grep -v 'interface ' | \
    grep -v 'as const' | \
    grep -v 'Record<' | \
    grep -v ': typeof ' || true)

  if [ -n "$matches" ]; then
    echo "⚠️  Potential template variable leak (pattern: $pattern):"
    echo "$matches"
    echo ""
    FOUND=1
  fi
done

if [ "$FOUND" -eq 1 ]; then
  echo "❌ Template variable leak detected. Fix unresolved variables before committing."
  exit 1
else
  echo "✅ No template variable leaks found."
  exit 0
fi
