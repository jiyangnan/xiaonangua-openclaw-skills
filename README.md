# xiaonangua-openclaw-skills

Public, reusable OpenClaw skills contributed by **xiaonangua**.

## Included skills

- `agent-work-standards` — reliability standards for OpenClaw agents/clones: necessity check, clarification, high‑risk confirmation loop, minimum verifiability assertions, debug output template, memory layering, and sub-agent delivery contract.

## Install

Copy into your OpenClaw workspace:

- `skills/*` → `~/.openclaw/workspace/skills/`
- `KB/*` → `~/.openclaw/workspace/KB/`

Restart OpenClaw.

## Apply standards to a clone

Example (macOS/Linux):

```bash
chmod +x ~/.openclaw/workspace/skills/agent-work-standards/scripts/apply.sh
~/.openclaw/workspace/skills/agent-work-standards/scripts/apply.sh \
  ~/.openclaw/workspace-growth/AGENTS.md \
  ~/.openclaw/workspace/KB/rules/agent-work-standards-v1.md
```
