param(
    [int]$MaxMilestones = 10,
    [string]$ModelOverride = "",
    [ValidateSet("", "minimal", "low", "medium", "high", "xhigh")]
    [string]$ReasoningOverride = "",
    [switch]$StatusOnly
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$PlanPath = Join-Path $RepoRoot "docs\autopilot\milestones.json"
$SchemaPath = Join-Path $RepoRoot "scripts\autopilot-result.schema.json"
$RuntimeDir = Join-Path $RepoRoot ".codex-autopilot"
$StatePath = Join-Path $RuntimeDir "state.json"
$LogsDir = Join-Path $RuntimeDir "logs"
$LastResult = Join-Path $RuntimeDir "last-result.json"

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

if (-not (Test-Path $PlanPath)) { throw "Missing autopilot plan: $PlanPath" }
if (-not (Test-Path $SchemaPath)) { throw "Missing result schema: $SchemaPath" }

$plan = Get-Content $PlanPath -Raw | ConvertFrom-Json

if (Test-Path $StatePath) {
    $state = Get-Content $StatePath -Raw | ConvertFrom-Json
} else {
    $state = [pscustomobject]@{
        completed = @()
        blocked = $null
    }
}

function Save-State {
    param($State)
    $State | ConvertTo-Json -Depth 10 | Set-Content -Path $StatePath -Encoding UTF8
}

function Git([string[]]$Args) {
    $out = & git @Args 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Args -join ' ') failed:`n$out"
    }
    return $out
}

function Is-Completed([string]$Id) {
    return @($state.completed | ForEach-Object { $_.id }) -contains $Id
}

function Assert-Clean {
    $dirty = (& git status --porcelain)
    if ($LASTEXITCODE -ne 0) { throw "git status failed" }
    if ($dirty) {
        throw "Working tree is not clean. Autopilot stops before touching code.`n$dirty"
    }
}

function Show-Status {
    Write-Host ""
    Write-Host "BDM Codex Autopilot" -ForegroundColor Cyan
    Write-Host "-------------------"
    foreach ($m in $plan.milestones) {
        $done = $state.completed | Where-Object { $_.id -eq $m.id } | Select-Object -First 1
        if ($done) {
            Write-Host ("[DONE]    {0,-7} {1}  {2}" -f $m.id, $m.title, $done.commit) -ForegroundColor Green
        } elseif ($state.blocked -and $state.blocked.id -eq $m.id) {
            Write-Host ("[BLOCKED] {0,-7} {1}" -f $m.id, $m.title) -ForegroundColor Red
        } else {
            Write-Host ("[TODO]    {0,-7} {1}" -f $m.id, $m.title)
        }
    }
    Write-Host ""
}

Show-Status
if ($StatusOnly) { exit 0 }

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    throw "Codex CLI was not found in PATH. Install/update Codex CLI and authenticate, then rerun."
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "git was not found in PATH."
}

# Clear a previous runtime block only when rerunning; the same milestone will be attempted again.
$state.blocked = $null
Save-State $state

$ran = 0
while ($ran -lt $MaxMilestones) {
    $next = $null
    foreach ($m in $plan.milestones) {
        if (-not (Is-Completed $m.id)) {
            $next = $m
            break
        }
    }

    if (-not $next) {
        Write-Host "All milestones in this tranche are complete." -ForegroundColor Green
        break
    }

    Assert-Clean

    $beforeHead = (Git @("rev-parse", "HEAD")).Trim()
    $promptPath = Join-Path $RepoRoot $next.prompt
    if (-not (Test-Path $promptPath)) { throw "Missing milestone prompt: $promptPath" }
    $milestonePrompt = Get-Content $promptPath -Raw

    $model = if ($ModelOverride) { $ModelOverride } else { [string]$next.model }
    $reasoning = if ($ReasoningOverride) { $ReasoningOverride } else { [string]$next.reasoning }

    $runPrompt = @"
You are running BDM Codex Autopilot milestone $($next.id): $($next.title).

Read and obey the repository AGENTS.md before doing any work.
Read docs/ARCHITECTURE.md and docs/autopilot/PRODUCT_GUARDRAILS.md.
Known non-blocking debt is in docs/autopilot/TECH_DEBT.md.

Work on this milestone only.
Do not start any later milestone.
A DONE result requires the requested local Git commit and a clean working tree.
If a stop condition occurs, return BLOCKED. Do not create a partial milestone commit.

ACTIVE MILESTONE:

$milestonePrompt

At the end, return the structured result required by the output schema.
The `commit` field must contain the resulting commit hash when DONE, otherwise an empty string.
The `reason` field should be empty when DONE and concise when BLOCKED.
"@

    Write-Host ""
    Write-Host "Starting $($next.id): $($next.title)" -ForegroundColor Cyan
    Write-Host "Model: $model | reasoning: $reasoning"

    if (Test-Path $LastResult) { Remove-Item $LastResult -Force }

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $logPath = Join-Path $LogsDir "$($next.id)-$timestamp.log"

    $codexArgs = @(
        "exec",
        "--sandbox", "workspace-write",
        "-m", $model,
        "-c", "model_reasoning_effort=`"$reasoning`"",
        "--output-schema", $SchemaPath,
        "-o", $LastResult,
        $runPrompt
    )

    & codex @codexArgs 2>&1 | Tee-Object -FilePath $logPath
    $codexExit = $LASTEXITCODE

    if ($codexExit -ne 0) {
        $state.blocked = [pscustomobject]@{
            id = $next.id
            reason = "codex exec exited with code $codexExit"
            at = (Get-Date).ToString("o")
        }
        Save-State $state
        throw "Codex failed on milestone $($next.id). See $logPath"
    }

    if (-not (Test-Path $LastResult)) {
        throw "Codex produced no structured result for milestone $($next.id)."
    }

    $result = Get-Content $LastResult -Raw | ConvertFrom-Json

    if ($result.status -ne "DONE") {
        $state.blocked = [pscustomobject]@{
            id = $next.id
            reason = $result.reason
            summary = $result.summary
            at = (Get-Date).ToString("o")
        }
        Save-State $state
        Write-Host "Milestone $($next.id) BLOCKED: $($result.reason)" -ForegroundColor Red
        break
    }

    Assert-Clean
    $afterHead = (Git @("rev-parse", "HEAD")).Trim()

    if ($afterHead -eq $beforeHead) {
        throw "Milestone $($next.id) reported DONE but created no commit."
    }

    if ($result.commit -and -not $afterHead.StartsWith([string]$result.commit) -and -not ([string]$result.commit).StartsWith($afterHead.Substring(0, [Math]::Min(7, $afterHead.Length)))) {
        Write-Warning "Reported commit '$($result.commit)' differs from HEAD '$afterHead'. HEAD will be recorded."
    }

    $completedEntry = [pscustomobject]@{
        id = $next.id
        commit = $afterHead
        summary = $result.summary
        tests_total = $result.tests_total
        completed_at = (Get-Date).ToString("o")
    }
    $state.completed = @($state.completed) + $completedEntry
    $state.blocked = $null
    Save-State $state

    Write-Host "DONE $($next.id) -> $afterHead" -ForegroundColor Green
    $ran++

    if ($next.stop_after -eq $true) {
        Write-Host ""
        Write-Host "Checkpoint reached after $($next.id). Autopilot is intentionally stopping before rotations/fatigue." -ForegroundColor Yellow
        break
    }
}

Show-Status
