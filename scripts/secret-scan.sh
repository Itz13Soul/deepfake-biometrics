#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/.."

PATTERNS='AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(GEMINI_API_KEY|ANTHROPIC_API_KEY|SUPABASE_SERVICE_ROLE_KEY|CRON_SECRET)[[:space:]]*=[[:space:]]*[^[:space:]#]+'

if git rev-parse --git-dir >/dev/null 2>&1; then
  FILES=$(git ls-files --cached --others --exclude-standard | grep -v -E '^(package-lock\.json|scripts/secret-scan\.sh)$')
else
  FILES=$(find . -type f -not -path './node_modules/*' -not -path './.next/*' -not -path './.git/*' -not -name 'package-lock.json' -not -name 'secret-scan.sh')
fi

HITS=$(echo "$FILES" | xargs -r grep -I -n -E "$PATTERNS" 2>/dev/null | grep -v '\.env\.example')
if [ -n "$HITS" ]; then
  echo "POSSIBLE SECRETS FOUND:"
  echo "$HITS" | sed -E 's/(=[[:space:]]*).{6,}/\1[redacted]/'
  exit 1
fi
echo "secret-scan: no matches"
