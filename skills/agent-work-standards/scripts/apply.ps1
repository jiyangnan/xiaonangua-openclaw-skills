Param(
  [Parameter(Mandatory=$true)][string]$AgentsMd,
  [Parameter(Mandatory=$true)][string]$RulePath
)

# Apply Agent Work Standards section to a target AGENTS.md (Windows PowerShell).
# Usage:
#   .\apply.ps1 -AgentsMd "C:\Users\you\.openclaw\workspace-growth\AGENTS.md" -RulePath "C:\Users\you\.openclaw\workspace\KB\rules\agent-work-standards-v1.md"

if (-not (Test-Path $AgentsMd)) {
  Write-Error "AGENTS.md not found: $AgentsMd"
  exit 2
}

$marker = "## ✅ Agent Work Standards v1 (must follow)"
$text = Get-Content -Raw -Encoding UTF8 $AgentsMd

if ($text -match [regex]::Escape($marker)) {
  Write-Host "Already patched: $AgentsMd"
  exit 0
}

$insertAfter = "Don't ask permission. Just do it."

$section = @"

$marker

This agent must follow the shared operating standards:
- Rule file (execution): `$RulePath`

### Must-do (before every answer/operation)
1) Necessity check (target object → necessary conditions → ambiguity → high-risk confirmation)
2) High-risk confirmation loop (preview → confirm → execute)
3) Minimum verifiability assertions (no assertion = not done)

### Debug output template
Symptom → Hypotheses → Verification → Root cause → Fix → Regression test
"@

$idx = $text.IndexOf($insertAfter)
if ($idx -ge 0) {
  $idxEnd = $idx + $insertAfter.Length
  $newText = $text.Substring(0, $idxEnd) + $section + $text.Substring($idxEnd)
} else {
  # Fallback: insert after "## Every Session" header
  $alt = "## Every Session`n"
  $idx2 = $text.IndexOf($alt)
  if ($idx2 -lt 0) {
    Write-Error "Cannot find insertion anchor. Please paste the section manually after: '$insertAfter'"
    exit 3
  }
  $idxEnd2 = $idx2 + $alt.Length
  $newText = $text.Substring(0, $idxEnd2) + $section + $text.Substring($idxEnd2)
}

Set-Content -Path $AgentsMd -Value $newText -Encoding UTF8
Write-Host "Patched: $AgentsMd"
