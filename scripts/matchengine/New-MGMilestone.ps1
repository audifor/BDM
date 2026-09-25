[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Milestone,

    [Parameter(Mandatory = $true)]
    [string]$Slug,

    [Parameter(Mandatory = $true)]
    [string]$BaseSha,

    [switch]$DryRun
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$repoTop = (& git -C $repoRoot rev-parse --show-toplevel 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoTop)) {
    throw "Not a Git repository: $repoRoot"
}
$repoRoot = (Resolve-Path $repoTop).Path

$normalizedMilestone = $Milestone.Trim().ToUpperInvariant()
if ($normalizedMilestone -notmatch '^MG\d+[A-Z]$') {
    throw "Invalid milestone '$Milestone'. Expected a value such as MG8A."
}

$normalizedSlug = $Slug.Trim().ToLowerInvariant()
if ($normalizedSlug -notmatch '^[a-z0-9]+(?:-[a-z0-9]+)*$') {
    throw "Invalid slug '$Slug'. Use lowercase words separated by single hyphens."
}

$branchName = "matchengine-v3-$($normalizedMilestone.ToLowerInvariant())-$normalizedSlug"
$registeredWorktrees = (& git -C $repoRoot worktree list --porcelain 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) {
    throw 'Could not inspect registered Git worktrees.'
}
$worktreeLines = @($registeredWorktrees -split '\r?\n')
$mainBranchLine = [array]::IndexOf($worktreeLines, 'branch refs/heads/main')
$canonicalRoot = $repoRoot
if ($mainBranchLine -gt 0) {
    $mainWorktreeLine = @($worktreeLines[0..($mainBranchLine - 1)] | Where-Object { $_ -like 'worktree *' } | Select-Object -Last 1)
    if ($mainWorktreeLine.Count -gt 0) {
        $canonicalRoot = $mainWorktreeLine[0].Substring('worktree '.Length)
    }
}
$repoParent = Split-Path -Parent $canonicalRoot
$repoName = Split-Path -Leaf $canonicalRoot
$worktreePath = Join-Path $repoParent "$repoName-$normalizedMilestone"

& git -C $repoRoot cat-file -e "$BaseSha^{commit}" 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "Base SHA does not identify an existing commit: $BaseSha"
}
$resolvedBase = (& git -C $repoRoot rev-parse "$BaseSha^{commit}" 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Could not resolve base commit: $BaseSha"
}

& git -C $repoRoot show-ref --verify --quiet "refs/heads/$branchName"
if ($LASTEXITCODE -eq 0) {
    throw "Branch already exists: $branchName"
}
if ($LASTEXITCODE -gt 1) {
    throw "Could not check whether branch exists: $branchName"
}

$registeredPaths = @($worktreeLines | Where-Object { $_ -like 'worktree *' } | ForEach-Object { $_.Substring('worktree '.Length) })
$normalizedWorktreePath = $worktreePath -replace '\\', '/'
$pathIsRegistered = $false
foreach ($registeredPath in $registeredPaths) {
    if ([string]::Equals(($registeredPath -replace '\\', '/'), $normalizedWorktreePath, [StringComparison]::OrdinalIgnoreCase)) {
        $pathIsRegistered = $true
        break
    }
}
if ((Test-Path -LiteralPath $worktreePath) -or $pathIsRegistered) {
    throw "Worktree path already exists or is registered: $worktreePath"
}

$gitCommand = "git worktree add -b $branchName $worktreePath $resolvedBase"
if ($DryRun) {
    Write-Output 'MG MILESTONE DRY RUN'
    Write-Output "BRANCH: $branchName"
    Write-Output "WORKTREE: $worktreePath"
    Write-Output "BASE: $resolvedBase"
    Write-Output "GIT COMMAND: $gitCommand"
    Write-Output 'FILESYSTEM OR GIT MUTATION: NONE'
    return
}

& git -C $repoRoot worktree add -b $branchName $worktreePath $resolvedBase
if ($LASTEXITCODE -ne 0) {
    throw "git worktree add failed with exit code $LASTEXITCODE"
}

$actualBranch = (& git -C $worktreePath branch --show-current 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'Could not verify the new worktree branch.'
}
$actualHead = (& git -C $worktreePath rev-parse HEAD 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'Could not verify the new worktree HEAD.'
}
$status = (& git -C $worktreePath status --porcelain 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'Could not verify the new worktree status.'
}

$clean = [string]::IsNullOrWhiteSpace($status)
if ($actualBranch -ne $branchName -or $actualHead -ne $resolvedBase -or -not $clean) {
    throw "New worktree verification failed. Branch='$actualBranch'; HEAD='$actualHead'; clean=$clean. Worktree was preserved for inspection."
}

Write-Output 'MG MILESTONE CREATED: PASS'
Write-Output "MILESTONE: $normalizedMilestone"
Write-Output "BRANCH: $actualBranch"
Write-Output "WORKTREE: $worktreePath"
Write-Output "BASE: $resolvedBase"
Write-Output "HEAD: $actualHead"
Write-Output "WORKTREE CLEAN: $(if ($clean) { 'YES' } else { 'NO' })"
