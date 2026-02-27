#!/usr/bin/env bash
set -euo pipefail

# Apply Agent Work Standards section to a target AGENTS.md.
# Usage:
#   ./apply.sh /path/to/AGENTS.md /absolute/path/to/workspace/KB/rules/agent-work-standards-v1.md

AGENTS_MD="${1:-}"
RULE_PATH="${2:-}"

if [[ -z "$AGENTS_MD" || -z "$RULE_PATH" ]]; then
  echo "Usage: $0 /path/to/AGENTS.md /abs/path/to/rule.md" >&2
  exit 2
fi

if [[ ! -f "$AGENTS_MD" ]]; then
  echo "AGENTS.md not found: $AGENTS_MD" >&2
  exit 2
fi

MARKER="## ✅ Agent Work Standards v1 (must follow)"

if command -v rg >/dev/null 2>&1 && rg -q "^\\Q${MARKER}\\E$" "$AGENTS_MD"; then
  echo "Already patched: $AGENTS_MD"
  exit 0
fi

INSERT_AFTER="Don't ask permission. Just do it."

SECTION=$(cat <<EOF

${MARKER}

This agent must follow the shared operating standards:
- Rule file (execution): \\`${RULE_PATH}\\`

### Must-do (before every answer/operation)
1) Necessity check (target object → necessary conditions → ambiguity → high-risk confirmation)
2) High-risk confirmation loop (preview → confirm → execute)
3) Minimum verifiability assertions (no assertion = not done)

### Debug output template
Symptom → Hypotheses → Verification → Root cause → Fix → Regression test
EOF
)

python3 - "$AGENTS_MD" "$INSERT_AFTER" "$SECTION" <<'PY'
import sys
p, needle, section = sys.argv[1:4]
text = open(p,'r',encoding='utf-8').read()
idx = text.find(needle)
if idx == -1:
    raise SystemExit(f"Cannot find insertion anchor: {needle}")
idx_end = idx + len(needle)
new = text[:idx_end] + section + text[idx_end:]
open(p,'w',encoding='utf-8').write(new)
print(f"Patched: {p}")
PY
