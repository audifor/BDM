# P0E bridge v2. Read-only WorldDB; real Tauri adapter + GameWorld Save V4.
# Resumes the EXISTING dedicated BDM worktree after PowerShell 5.1 mistakes
# Cargo's normal stderr "Compiling ..." for a terminating error.
# No overwrite/reset/checkout/clean of worktree, SQLite or previous reports.
param(
  [string]$Repository = 'C:\BDM',
  [string]$P0EWorldDb = 'C:\BDM_DB\DDL-12\output\bdm_world_ddl12_p0e_stage.db',
  [string]$P0EManifest = "$HOME\Downloads\BDM_P0E_PERSISTENTE_RESULTADOS\p0e_materialized_persons.json",
  [switch]$ResumeExistingWorktree,
  [switch]$SelfTestNativeStderr
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-P0ENativeLogged {
  param(
    [Parameter(Mandatory=$true)][string]$Executable,
    [Parameter(Mandatory=$true)][string[]]$Arguments,
    [Parameter(Mandatory=$true)][string]$LogFile
  )
  # Windows PowerShell 5.1 wraps native stderr in NativeCommandError.
  # ErrorAction=Stop therefore crashes on harmless Cargo progress messages.
  # Within this native-command scope ONLY, collect both output streams,
  # then trust the actual native exit code, not stderr text.
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $Executable @Arguments *>&1 | Out-File -LiteralPath $LogFile -Encoding utf8
    $code = $LASTEXITCODE
    if ($null -eq $code) { throw "No exit code captured from $Executable" }
    return [int]$code
  } finally {
    $ErrorActionPreference = $previous
  }
}

if ($SelfTestNativeStderr) {
  $probe = [IO.Path]::GetTempFileName()
  try {
    $exit = Invoke-P0ENativeLogged -Executable $env:ComSpec -Arguments @(
      '/D', '/C', 'echo Compiling proc-macro2 v1.0.107 1>&2'
    ) -LogFile $probe
    $text = Get-Content -LiteralPath $probe -Raw
    if ($exit -ne 0 -or $text -notmatch 'Compiling proc-macro2 v1.0.107') {
      throw "Native stderr self-test failed (exit $exit, output $text)"
    }
    Write-Host 'PASS: harmless Cargo-style native stderr does not abort Windows PowerShell.'
    exit 0
  } finally {
    Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
  }
}

try {
  $branch = 'feat/p0e-persistent-name-consumer-smoke'
  $worktree = 'C:\BDM-P0E-GAME-BRIDGE'
  $folder = Join-Path $HOME 'Downloads\BDM_P0E_GAME_BRIDGE_RESULTADOS_v2'
  $zip = Join-Path $HOME 'Downloads\BDM_P0E_GAME_BRIDGE_REAL_v2.zip'
  foreach ($p in @($Repository, $P0EWorldDb, $P0EManifest)) {
    if (!(Test-Path -LiteralPath $p)) { throw "Falta entrada: $p" }
  }
  foreach ($p in @($folder, $zip)) {
    if (Test-Path -LiteralPath $p) { throw "No sobrescribir evidencias previas: $p" }
  }
  if (!(Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Cargo Rust no disponible' }
  if (!(Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm no disponible' }
  $originalHash = (Get-FileHash -LiteralPath $P0EWorldDb -Algorithm SHA256).Hash
  $manifestHash = (Get-FileHash -LiteralPath $P0EManifest -Algorithm SHA256).Hash
  $manifest = Get-Content -LiteralPath $P0EManifest -Raw | ConvertFrom-Json
  if ($manifest.status -ne 'PASS_P0E_STANDALONE_PERSON_PERSISTED_CLONE' -or
      @($manifest.persons).Count -ne 20) {
    throw 'Manifiesto P0E invalido: se esperaban exactamente 20 personas'
  }

  Push-Location $Repository
  try {
    & git fetch origin ("refs/heads/" + $branch + ":refs/remotes/origin/" + $branch)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo actualizar el ref BDM P0E' }
    if (Test-Path -LiteralPath $worktree) {
      if (!$ResumeExistingWorktree) {
        throw "Worktree ya existe. Usa -ResumeExistingWorktree; no borrar $worktree"
      }
      $registered = & git -C $worktree rev-parse --show-toplevel
      if ($LASTEXITCODE -ne 0 -or
          [IO.Path]::GetFullPath($registered).TrimEnd('\') -ne
          [IO.Path]::GetFullPath($worktree).TrimEnd('\')) {
        throw "No es el worktree Git dedicado a P0E: $worktree"
      }
      $critical = @(
        'src-tauri/src/world_db_bootstrap.rs',
        'src-tauri/Cargo.toml',
        'src/app/game/WorldDbGameBootstrap.test.ts',
        'src/domain/worldDb/GameBootstrap.ts',
        'src/domain/person/Person.ts',
        'src/app/game/WorldDbGameBootstrap.ts',
        'src/save/GameWorldSaveV1.ts',
        'package.json', 'package-lock.json'
      )
      foreach ($p in $critical) {
        $local = & git -C $worktree rev-parse ("HEAD:" + $p)
        if ($LASTEXITCODE -ne 0) { throw "No se encontro el fichero critico local: $p" }
        $remote = & git -C $Repository rev-parse ("origin/" + $branch + ":" + $p)
        if ($LASTEXITCODE -ne 0 -or $local -ne $remote) {
          throw "Cambio de version de codigo P0E: $p. No sobrescribir worktree."
        }
      }
      $changedCritical = @(& git -C $worktree status --porcelain -- $critical)
      if ($LASTEXITCODE -ne 0 -or $changedCritical.Count -gt 0) {
        throw "Codigo de juego modificado localmente. No se pisa: $($changedCritical -join '; ')"
      }
      $otherChanges = @(& git -C $worktree status --porcelain)
      if ($LASTEXITCODE -ne 0) { throw 'No se pudo inspeccionar el worktree BDM' }
      $invalidChanges = @($otherChanges | Where-Object {
        $_ -cne ' M src-tauri/Cargo.lock'
      })
      if ($invalidChanges.Count -gt 0) {
        throw "Worktree contiene cambios ajenos al lockfile: $($invalidChanges -join '; ')"
      }
      if ($otherChanges.Count -gt 0) {
        Write-Host 'El Cargo.lock local se conserva intacto; no se restaura ni se hace checkout.' -ForegroundColor Yellow
      }
      Write-Host 'Reutilizando worktree BDM existente sin checkout/limpieza.'
    } else {
      & git worktree add --detach $worktree ("origin/" + $branch)
      if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear worktree BDM P0E' }
    }
  } finally { Pop-Location }

  New-Item -ItemType Directory -Path $folder | Out-Null
  $rustLog = Join-Path $folder 'p0e_tauri_readback.log'
  $npmLog = Join-Path $folder 'npm-ci.log'
  $tsLog = Join-Path $folder 'p0e_gameworld_save_v4.log'
  $summaryPath = Join-Path $folder 'p0e_game_bridge_summary.json'
  $env:BDM_P0E_STAGE_DB = (Resolve-Path -LiteralPath $P0EWorldDb).Path
  $env:BDM_P0E_MANIFEST = (Resolve-Path -LiteralPath $P0EManifest).Path
  $names = @('CARGO_BUILD_JOBS', 'CARGO_INCREMENTAL', 'RUST_MIN_STACK')
  $previousEnv = @{}
  foreach ($name in $names) {
    $previousEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
  }
  $env:CARGO_BUILD_JOBS = '1'
  $env:CARGO_INCREMENTAL = '0'
  $env:RUST_MIN_STACK = '16777216'
  $rustExit = -1
  $npmExit = -1
  $tsExit = -1
  Push-Location $worktree
  try {
    Write-Host 'Checking P0E PERSON via Tauri (WorldDB read-only, Cargo 1 job)...'
    $rustExit = Invoke-P0ENativeLogged -Executable 'cargo.exe' -Arguments @(
      'test', '--jobs', '1', '--manifest-path',
      (Join-Path $worktree 'src-tauri\Cargo.toml'),
      'p0e_read_persistent_worlddb_people_via_actual_tauri_person_adapter'
    ) -LogFile $rustLog
    if ($rustExit -ne 0) {
      Write-Host "Tauri Rust finalizo con codigo $rustExit. Ver $rustLog" -ForegroundColor Yellow
    } else {
      Write-Host 'Tauri P0E PASS; comprobando dependencias JS...'
      $npmExit = Invoke-P0ENativeLogged -Executable 'npm.cmd' -Arguments @('ci') -LogFile $npmLog
      if ($npmExit -eq 0) {
        Write-Host 'Checking P0E names through GameWorld and Save V4...'
        $vitestCmd = Join-Path $worktree 'node_modules\.bin\vitest.cmd'
        if (!(Test-Path -LiteralPath $vitestCmd -PathType Leaf)) {
          throw "Vitest no fue instalado: $vitestCmd"
        }
        $tsExit = Invoke-P0ENativeLogged -Executable $vitestCmd -Arguments @(
          'run', 'src/app/game/WorldDbGameBootstrap.test.ts',
          '-t', 'P0E persistent names flow', '--maxWorkers=1',
          '--no-file-parallelism', '--testTimeout=30000'
        ) -LogFile $tsLog
      } else {
        Write-Host "npm ci fallo ($npmExit); revisar $npmLog" -ForegroundColor Yellow
      }
    }
  } finally {
    Pop-Location
    foreach ($name in $names) {
      [Environment]::SetEnvironmentVariable($name, $previousEnv[$name], 'Process')
    }
    Remove-Item Env:BDM_P0E_STAGE_DB -ErrorAction SilentlyContinue
    Remove-Item Env:BDM_P0E_MANIFEST -ErrorAction SilentlyContinue
  }

  $afterHash = (Get-FileHash -LiteralPath $P0EWorldDb -Algorithm SHA256).Hash
  $rustText = if (Test-Path -LiteralPath $rustLog) { Get-Content -LiteralPath $rustLog -Raw } else { '' }
  $tsText = if (Test-Path -LiteralPath $tsLog) { Get-Content -LiteralPath $tsLog -Raw } else { '' }
  $passed = ($rustExit -eq 0 -and $npmExit -eq 0 -and $tsExit -eq 0 -and
             $afterHash -eq $originalHash -and
             $rustText -match '1 passed' -and $tsText -match '1 passed')
  $summary = [ordered]@{
    status = if ($passed) { 'PASS_P0E_SOURCE_BACKED_TAURI_AND_GAMEWORLD_SAVE_V4_FIXTURE' } else { 'FAIL_P0E_BRIDGE_NOT_CERTIFIED' }
    source_manifest_people = 20
    tauri_person_query_test_exit = $rustExit
    npm_install_exit = $npmExit
    gameworld_save_v4_test_exit = $tsExit
    worlddb_clone_sha256_before = $originalHash
    worlddb_clone_sha256_after = $afterHash
    manifest_sha256 = $manifestHash
    clone_unchanged = ($originalHash -eq $afterHash)
    game_bootstrap_roster_used = 'SYNTHETIC_SLICE_WITH_P0E_PERSON_NAMES'
    actual_playable_roster_activated = $false
    production_modified = $false
  }
  $summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $summaryPath -Encoding UTF8
  $files = @($summaryPath)
  foreach ($p in @($rustLog, $npmLog, $tsLog)) {
    if (Test-Path -LiteralPath $p -PathType Leaf) { $files += $p }
  }
  Compress-Archive -LiteralPath $files -DestinationPath $zip
  Write-Host "P0E Bridge: $($summary.status)"
  Write-Host "ZIP diagnostico: $zip"
  if (!$passed) { throw "Bridge P0E NO certificado. Entregar $zip para analizar ERROR REAL." }
  Write-Host 'PASS: nombre persistido via Tauri y Save V4 en slice de prueba. No hay jugadores de plantilla.' -ForegroundColor Green
} catch {
  Write-Host ('P0E GAME BRIDGE ERROR: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
