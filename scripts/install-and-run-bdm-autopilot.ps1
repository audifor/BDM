param(
    [switch]$NoRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "git was not found in PATH."
}
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    throw "Codex CLI was not found in PATH. Install/update Codex CLI and authenticate first."
}

# Safety: do not install over tracked local edits.
& git diff --quiet
if ($LASTEXITCODE -ne 0) {
    throw "Tracked working-tree changes already exist. Commit/stash them before installing autopilot."
}
& git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    throw "Staged changes already exist. Commit/stash them before installing autopilot."
}

# The current code must include the PlayerId-attribution milestone.
& git merge-base --is-ancestor f676d25 HEAD
if ($LASTEXITCODE -ne 0) {
    throw "Expected code ancestor f676d25 was not found in current HEAD. Do not install this tranche on a different BDM state."
}

$gitignore = Join-Path $RepoRoot ".gitignore"
if (-not (Test-Path $gitignore)) {
    New-Item -ItemType File -Path $gitignore | Out-Null
}
$content = Get-Content $gitignore -Raw
if ($content -notmatch '(?m)^\.codex-autopilot/$') {
    if ($content.Length -gt 0 -and -not $content.EndsWith("`n")) {
        Add-Content $gitignore ""
    }
    Add-Content $gitignore ".codex-autopilot/"
}

# Stage only autopilot infrastructure and the .gitignore update.
& git add -- AGENTS.md .gitignore docs/autopilot scripts/bdm-autopilot.ps1 scripts/install-and-run-bdm-autopilot.ps1 scripts/autopilot-result.schema.json
if ($LASTEXITCODE -ne 0) { throw "git add failed" }

$staged = & git diff --cached --name-only
if (-not $staged) {
    Write-Host "Autopilot infrastructure is already committed." -ForegroundColor Yellow
} else {
    & git commit -m "chore: add codex autopilot workflow"
    if ($LASTEXITCODE -ne 0) { throw "Could not commit autopilot infrastructure." }
    Write-Host "Autopilot infrastructure committed." -ForegroundColor Green
}

if (-not $NoRun) {
    & (Join-Path $PSScriptRoot "bdm-autopilot.ps1")
    exit $LASTEXITCODE
}
