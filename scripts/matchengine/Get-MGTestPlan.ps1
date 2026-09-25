[CmdletBinding()]
param(
    [string]$Since,
    [switch]$Run
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$repoTop = (& git -C $repoRoot rev-parse --show-toplevel 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoTop)) {
    throw "Not a Git repository: $repoRoot"
}
$repoRoot = (Resolve-Path $repoTop).Path
$mapPath = Join-Path $PSScriptRoot 'test-impact-map.json'
if (-not (Test-Path -LiteralPath $mapPath -PathType Leaf)) {
    throw "Impact map not found: $mapPath"
}
$impactMap = Get-Content -LiteralPath $mapPath -Raw | ConvertFrom-Json

function Get-GitLines {
    param([string[]]$Arguments)

    $output = & git -C $repoRoot @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $exitCode. $($output -join ' ')"
    }
    return @($output | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -ne '' })
}

$changed = @()
if (-not [string]::IsNullOrWhiteSpace($Since)) {
    & git -C $repoRoot cat-file -e "$Since^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Since value does not identify an existing commit: $Since"
    }
    $resolvedSince = (& git -C $repoRoot rev-parse "$Since^{commit}" 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Could not resolve commit: $Since"
    }
    $changed += Get-GitLines -Arguments @('diff', '--name-only', '--diff-filter=ACMRT', "$resolvedSince...HEAD")
}

$changed += Get-GitLines -Arguments @('diff', '--name-only')
$changed += Get-GitLines -Arguments @('diff', '--cached', '--name-only')
$changed += Get-GitLines -Arguments @('ls-files', '--others', '--exclude-standard')
$changedFiles = @($changed | ForEach-Object { $_ -replace '\\', '/' } | Sort-Object -Unique)

$riskRank = @{ T0 = 0; T1 = 1; T2 = 2 }
$highestRisk = 'T0'
$typecheckRequired = $false
$unknownMatchFiles = @()
$missingMappedTests = @()
$testReasons = @{}
$matchedRuleIds = @()

function Add-TestRecommendation {
    param(
        [string]$Path,
        [string]$Reason
    )

    $normalizedPath = $Path -replace '\\', '/'
    $absolutePath = Join-Path $repoRoot ($normalizedPath -replace '/', '\')
    if (-not (Test-Path -LiteralPath $absolutePath -PathType Leaf)) {
        $script:missingMappedTests += $normalizedPath
        return
    }
    if (-not $script:testReasons.ContainsKey($normalizedPath)) {
        $script:testReasons[$normalizedPath] = @()
    }
    if ($script:testReasons[$normalizedPath] -notcontains $Reason) {
        $script:testReasons[$normalizedPath] += $Reason
    }
}

function Get-DirectSiblingTest {
    param([string]$Path)

    if ($Path -match '\.(test|spec)\.(ts|tsx|js|jsx)$') {
        return $Path
    }
    if ($Path -match '^(.*)\.(ts|tsx|js|jsx)$') {
        $stem = $Matches[1]
        $extension = $Matches[2]
        foreach ($suffix in @('test', 'spec')) {
            $candidate = "$stem.$suffix.$extension"
            if (Test-Path -LiteralPath (Join-Path $repoRoot ($candidate -replace '/', '\')) -PathType Leaf) {
                return $candidate
            }
        }
    }
    return $null
}

foreach ($changedPath in $changedFiles) {
    $matchedThisFile = $false
    foreach ($rule in $impactMap.rules) {
        $matchesRule = $false
        foreach ($pattern in $rule.patterns) {
            if ($changedPath -like [string]$pattern) {
                $matchesRule = $true
                break
            }
        }
        if (-not $matchesRule) {
            continue
        }

        $matchedThisFile = $true
        if ($matchedRuleIds -notcontains [string]$rule.id) {
            $matchedRuleIds += [string]$rule.id
        }
        if ($riskRank[[string]$rule.level] -gt $riskRank[$highestRisk]) {
            $highestRisk = [string]$rule.level
        }
        if ([bool]$rule.typecheck) {
            $typecheckRequired = $true
        }
        foreach ($testPath in $rule.tests) {
            Add-TestRecommendation -Path ([string]$testPath) -Reason ([string]$rule.reason)
        }
    }

    if ($changedPath -like 'src/engine/match/*' -and -not $matchedThisFile) {
        $unknownMatchFiles += $changedPath
    }

    $siblingTest = Get-DirectSiblingTest -Path $changedPath
    if ($null -ne $siblingTest) {
        $siblingReason = if ($siblingTest -eq $changedPath) {
            "Changed test file is included directly: $changedPath."
        } else {
            "Direct sibling test for $changedPath."
        }
        Add-TestRecommendation -Path $siblingTest -Reason $siblingReason
    }
}

$recommendedTests = @($testReasons.Keys | Sort-Object)
$unknownImpact = $unknownMatchFiles.Count -gt 0 -or $missingMappedTests.Count -gt 0
Write-Output 'MATCHENGINE TEST IMPACT PLAN'
if ($changedFiles.Count -eq 0) {
    Write-Output 'CHANGED FILES: none'
} else {
    Write-Output 'CHANGED FILES:'
    foreach ($path in $changedFiles) { Write-Output "- $path" }
}
if ($unknownMatchFiles.Count -gt 0) {
    Write-Output 'RISK: UNKNOWN MATCHENGINE IMPACT'
    Write-Output 'MANUAL REVIEW REQUIRED'
    foreach ($path in $unknownMatchFiles) { Write-Output "UNMAPPED MATCHENGINE FILE: $path" }
} else {
    Write-Output "RISK: $highestRisk"
}
foreach ($path in ($missingMappedTests | Sort-Object -Unique)) {
    Write-Output "MAPPED TEST NOT FOUND: $path"
}
if ($recommendedTests.Count -gt 0) {
    $testCommand = 'npm test -- ' + ($recommendedTests -join ' ')
    Write-Output 'TEST COMMAND 1:'
    Write-Output $testCommand
    $allReasons = @($recommendedTests | ForEach-Object { $testReasons[$_] } | Select-Object -Unique)
    Write-Output "REASON: $($allReasons -join ' ')"
} else {
    Write-Output 'TESTS: no focused test was mapped or discovered.'
}
if ($typecheckRequired) {
    Write-Output 'TYPECHECK: npm run typecheck'
    Write-Output 'TYPECHECK REASON: a mapped shared contract or cross-module signature changed.'
} else {
    Write-Output 'TYPECHECK: NOT REQUIRED'
}
Write-Output 'FULL SUITE: NOT REQUIRED'
Write-Output 'BUILD: NOT REQUIRED'
Write-Output 'T3: final MG certification is handled by Invoke-MGCertification.ps1.'
if ($matchedRuleIds.Count -gt 0) {
    Write-Output "MATCHED RULES: $($matchedRuleIds -join ', ')"
}

if (-not $Run) {
    Write-Output 'MODE: PLAN ONLY; no tests executed.'
    return
}
if ($unknownImpact) {
    throw 'Run blocked: resolve UNKNOWN MATCHENGINE IMPACT and missing mapped tests before executing a partial plan.'
}

if ($recommendedTests.Count -gt 0) {
    $npmArguments = @('test', '--') + $recommendedTests
    Write-Output "RUNNING: npm $($npmArguments -join ' ')"
    $savedErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & npm @npmArguments
        $testExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $savedErrorActionPreference
    }
    if ($testExitCode -ne 0) {
        throw "Focused test command failed with exit code $testExitCode"
    }
}
if ($typecheckRequired) {
    Write-Output 'RUNNING: npm run typecheck'
    $savedErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & npm run typecheck
        $typecheckExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $savedErrorActionPreference
    }
    if ($typecheckExitCode -ne 0) {
        throw "Typecheck failed with exit code $typecheckExitCode"
    }
}
Write-Output 'PLAN EXECUTION: PASS'
