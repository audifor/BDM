param(
    [Parameter(Mandatory = $true)]
    [int]$Issue,
    [string]$Model = "gpt-5.6-sol",
    [ValidateSet("minimal", "low", "medium", "high", "xhigh")]
    [string]$Reasoning = "high"
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

function Run([string]$File, [string[]]$Arguments) {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$File $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "GitHub CLI (gh) not found in PATH." }
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { throw "Codex CLI not found in PATH." }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "git not found in PATH." }

$dirty = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw "git status failed" }
if ($dirty) { throw "Working tree must be clean before starting an issue." }

$repo = gh repo view --json nameWithOwner -q .nameWithOwner
if ($LASTEXITCODE -ne 0 -or -not $repo) { throw "Unable to resolve GitHub repository." }

$issueJson = gh issue view $Issue --repo $repo --json number,title,body,state,url
if ($LASTEXITCODE -ne 0) { throw "Unable to read issue #$Issue." }
$issue = $issueJson | ConvertFrom-Json
if ($issue.state -ne "OPEN") { throw "Issue #$Issue is not open." }

Run git @("fetch", "origin", "main")
Run git @("switch", "main")
Run git @("pull", "--ff-only", "origin", "main")

$slug = ($issue.title.ToLowerInvariant() -replace '^\[bdm\]\s*', '' -replace '[^a-z0-9]+', '-' -replace '(^-|-$)', '')
if (-not $slug) { $slug = "task" }
if ($slug.Length -gt 48) { $slug = $slug.Substring(0, 48).TrimEnd('-') }
$branch = "agent/issue-$($issue.number)-$slug"

$branchExists = git branch --list $branch
if ($branchExists) {
    Run git @("switch", $branch)
} else {
    Run git @("switch", "-c", $branch)
}

$prompt = @"
Implement GitHub issue #$($issue.number) for BDM.

Read and obey AGENTS.md first.
Read docs/ARCHITECTURE.md and docs/autopilot/PRODUCT_GUARDRAILS.md before editing.
Do not work outside this issue's scope.
Do not push and do not open a pull request. This runner handles GitHub operations.

ISSUE TITLE:
$($issue.title)

ISSUE BODY:
$($issue.body)

Requirements for completion:
- implement the issue completely;
- add or update tests as appropriate;
- run the repository Definition of Done from AGENTS.md;
- inspect the final diff for accidental unrelated changes;
- create one atomic local commit;
- leave the working tree clean.

If the issue cannot be completed without an unapproved product decision, architecture violation, hidden regression, or materially expanded scope, stop and report BLOCKED without committing partial work.
"@

$codexArgs = @(
    "exec",
    "--sandbox", "workspace-write",
    "-m", $Model,
    "-c", "model_reasoning_effort=`"$Reasoning`"",
    $prompt
)

Run codex $codexArgs

$dirtyAfter = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw "git status failed after Codex run" }
if ($dirtyAfter) { throw "Codex finished with a dirty working tree. Review before pushing.`n$dirtyAfter" }

$ahead = git rev-list --count origin/main..HEAD
if ($LASTEXITCODE -ne 0) { throw "Unable to compare branch with origin/main." }
if ([int]$ahead -lt 1) { throw "No commit was created for issue #$Issue." }

Run git @("push", "-u", "origin", $branch)

$existingPr = gh pr list --repo $repo --head $branch --state open --json number,url --limit 1 | ConvertFrom-Json
if ($existingPr.Count -gt 0) {
    Write-Host "PR already exists: $($existingPr[0].url)"
    exit 0
}

$prBody = @"
Closes #$($issue.number)

Implemented by the BDM issue runner using repository AGENTS.md and project guardrails.

CI must pass before merge.
"@

Run gh @(
    "pr", "create",
    "--repo", $repo,
    "--base", "main",
    "--head", $branch,
    "--title", $issue.title,
    "--body", $prBody
)

Write-Host ""
Write-Host "DONE" -ForegroundColor Green
Write-Host "Issue:  #$($issue.number) $($issue.title)"
Write-Host "Branch: $branch"
Write-Host "GitHub CI will validate the pull request."
