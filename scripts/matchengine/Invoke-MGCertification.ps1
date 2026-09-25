[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$ContinueOnFailure,
    [switch]$Serial,
    [ValidateRange(1, 64)]
    [int]$MaxWorkers = 4,
    [string]$ReportPath
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$repoTop = (& git -C $repoRoot rev-parse --show-toplevel 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoTop)) {
    throw "Not a Git repository: $repoRoot"
}
$repoRoot = (Resolve-Path $repoTop).Path

$focusedTests = @(
    'src/engine/match/MatchSession.test.ts',
    'src/engine/match/PlayerDrivenOffense.test.ts',
    'src/engine/match/MatchEngine.test.ts',
    'src/engine/match/DetailedMatchSimulation.test.ts',
    'src/engine/match/PlayerTruthAuthority.test.ts',
    'src/app/game/LiveMatchController.test.ts',
    'src/app/game/matchSeedLifecycle.test.ts',
    'src/ui/match/MatchPresentationSegment.test.ts',
    'src/ui/match/SpatialVisualBridge.test.ts'
)

function New-CertificationStep {
    param(
        [int]$Number,
        [string]$Name,
        [string]$Executable,
        [string[]]$Arguments
    )

    [PSCustomObject]@{
        Number = $Number
        Name = $Name
        Executable = $Executable
        Arguments = $Arguments
        WorkingDirectory = $repoRoot
        Command = "$Executable $($Arguments -join ' ')"
    }
}

$focusedArguments = @('test', '--', '--maxWorkers=1') + $focusedTests
$engineArguments = @('test', '--', '--maxWorkers=1', 'src/engine/match')
$fullSuiteArguments = if ($Serial) { @('test', '--', '--maxWorkers=1') } else { @('test', '--', "--maxWorkers=$MaxWorkers") }
$steps = @(
    (New-CertificationStep -Number 1 -Name 'Focused MatchEngine tests' -Executable 'npm' -Arguments $focusedArguments),
    (New-CertificationStep -Number 2 -Name 'MatchEngine regression' -Executable 'npm' -Arguments $engineArguments),
    (New-CertificationStep -Number 3 -Name 'Full test suite' -Executable 'npm' -Arguments $fullSuiteArguments),
    (New-CertificationStep -Number 4 -Name 'Typecheck' -Executable 'npm' -Arguments @('run', 'typecheck')),
    (New-CertificationStep -Number 5 -Name 'Build' -Executable 'npm' -Arguments @('run', 'build')),
    (New-CertificationStep -Number 6 -Name 'Git diff check' -Executable 'git' -Arguments @('diff', '--check')),
    (New-CertificationStep -Number 7 -Name 'Rust formatting check' -Executable 'cargo' -Arguments @('fmt', '--manifest-path', 'src-tauri/Cargo.toml', '--check')),
    (New-CertificationStep -Number 8 -Name 'Rust check' -Executable 'cargo' -Arguments @('check', '--manifest-path', 'src-tauri/Cargo.toml'))
)

if ($DryRun) {
    Write-Output 'MATCHENGINE CERTIFICATION DRY RUN'
    foreach ($step in $steps) {
        Write-Output (('{0:D2}. {1}' -f $step.Number, $step.Name))
        Write-Output "    COMMAND: $($step.Command)"
        Write-Output "    WORKING DIRECTORY: $($step.WorkingDirectory)"
    }
    Write-Output 'COMMANDS EXECUTED: NONE'
    if (-not [string]::IsNullOrWhiteSpace($ReportPath)) {
        Write-Output "REPORT PATH (used after a real run): $ReportPath"
    }
    return
}

$totalTimer = [System.Diagnostics.Stopwatch]::StartNew()
$results = @()
$failedStep = $null
foreach ($step in $steps) {
    Write-Output ("[{0:D2}/08] {1}" -f $step.Number, $step.Name)
    Write-Output "COMMAND: $($step.Command)"
    Write-Output "WORKING DIRECTORY: $($step.WorkingDirectory)"
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    Push-Location $step.WorkingDirectory
    $savedErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $stepArguments = $step.Arguments
        & $step.Executable @stepArguments
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $savedErrorActionPreference
        Pop-Location
        $timer.Stop()
    }
    if ($null -eq $exitCode) { $exitCode = 0 }
    $stageResult = if ($exitCode -eq 0) { 'PASS' } else { 'FAIL' }
    $duration = $timer.Elapsed.ToString('hh\:mm\:ss')
    $results += [PSCustomObject]@{
        stage = $step.Name
        command = $step.Command
        workingDirectory = $step.WorkingDirectory
        exitCode = [int]$exitCode
        result = $stageResult
        elapsed = $duration
    }
    Write-Output ("RESULT: {0} ({1}, exit {2})" -f $stageResult, $duration, $exitCode)

    if ($exitCode -ne 0) {
        $failedStep = $step
        Write-Output "FAILED STEP: $($step.Name)"
        Write-Output "COMMAND: $($step.Command)"
        Write-Output "EXIT CODE: $exitCode"
        if (-not $ContinueOnFailure) {
            Write-Output 'STOPPING: fail-fast is enabled.'
            break
        }
    }
}

$totalTimer.Stop()
$finalResult = if ($null -eq $failedStep) { 'PASS' } else { 'FAIL' }
$summary = [PSCustomObject]@{
    result = $finalResult
    failedStep = if ($null -eq $failedStep) { $null } else { $failedStep.Name }
    totalTime = $totalTimer.Elapsed.ToString('hh\:mm\:ss')
    steps = $results
}

Write-Output ''
Write-Output 'MATCHENGINE CERTIFICATION'
foreach ($result in $results) {
    Write-Output ("{0}: {1} ({2})" -f $result.stage.ToUpperInvariant(), $result.result, $result.elapsed)
}
Write-Output "TOTAL TIME: $($summary.totalTime)"
Write-Output "FINAL RESULT: $($summary.result)"

if (-not [string]::IsNullOrWhiteSpace($ReportPath)) {
    $resolvedReportPath = if ([System.IO.Path]::IsPathRooted($ReportPath)) {
        $ReportPath
    } else {
        Join-Path $repoRoot $ReportPath
    }
    $reportDirectory = Split-Path -Parent $resolvedReportPath
    if (-not (Test-Path -LiteralPath $reportDirectory -PathType Container)) {
        throw "Report directory does not exist: $reportDirectory"
    }
    $summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $resolvedReportPath -Encoding UTF8
    Write-Output "REPORT: $resolvedReportPath"
}

if ($finalResult -ne 'PASS') {
    throw "MG certification failed at '$($failedStep.Name)'."
}
