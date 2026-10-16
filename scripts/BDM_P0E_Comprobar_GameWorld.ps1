# BDM P0E: read the persistent P0E WorldDB clone via REAL Tauri query_person,
# and feed the same generated-person manifest to the real GameWorld+Save V4
# fixture test. Does NOT launch an actual save or mutate any WorldDB.
param(
  [string]$Repository = 'C:\BDM',
  [string]$P0EWorldDb = 'C:\BDM_DB\DDL-12\output\bdm_world_ddl12_p0e_stage.db',
  [string]$P0EManifest = "$HOME\Downloads\BDM_P0E_PERSISTENTE_RESULTADOS\p0e_materialized_persons.json"
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
try {
  $branch = 'feat/p0e-persistent-name-consumer-smoke'
  $worktree = 'C:\BDM-P0E-GAME-BRIDGE'
  $folder = Join-Path $HOME 'Downloads\BDM_P0E_GAME_BRIDGE_RESULTADOS'
  $zip = Join-Path $HOME 'Downloads\BDM_P0E_GAME_BRIDGE_REAL.zip'
  foreach ($p in @($Repository, $P0EWorldDb, $P0EManifest)) {
    if (!(Test-Path -LiteralPath $p)) { throw "Falta entrada: $p" }
  }
  foreach ($p in @($worktree, $folder, $zip)) {
    if (Test-Path -LiteralPath $p) { throw "Existe y no se sobrescribira: $p" }
  }
  if (!(Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Cargo de Rust no instalado' }
  if (!(Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Node npm no instalado' }
  $originalHash = (Get-FileHash -LiteralPath $P0EWorldDb -Algorithm SHA256).Hash
  $manifestHash = (Get-FileHash -LiteralPath $P0EManifest -Algorithm SHA256).Hash
  $manifest = Get-Content -LiteralPath $P0EManifest -Raw | ConvertFrom-Json
  if ($manifest.status -ne 'PASS_P0E_STANDALONE_PERSON_PERSISTED_CLONE' -or
      @($manifest.persons).Count -ne 20) { throw 'Manifest P0E invalid: expected 20 source-backed people' }
  Push-Location $Repository
  try {
    & git fetch origin ("refs/heads/" + $branch + ":refs/remotes/origin/" + $branch)
    if ($LASTEXITCODE -ne 0) { throw 'GitHub fetch P0E game failed' }
    & git worktree add --detach $worktree ("origin/" + $branch)
    if ($LASTEXITCODE -ne 0) { throw 'Worktree game creation failed' }
  } finally { Pop-Location }
  New-Item -ItemType Directory -Path $folder | Out-Null
  $rustLog = Join-Path $folder 'p0e_tauri_readback.log'
  $tsLog = Join-Path $folder 'p0e_gameworld_save_v4.log'
  $summaryPath = Join-Path $folder 'p0e_game_bridge_summary.json'

  $env:BDM_P0E_STAGE_DB = (Resolve-Path -LiteralPath $P0EWorldDb).Path
  $env:BDM_P0E_MANIFEST = (Resolve-Path -LiteralPath $P0EManifest).Path
  Push-Location $worktree
  try {
    Write-Host 'Checking P0E persisted PERSON via Tauri query_person (read-only)...'
    & cargo test --manifest-path "$worktree\src-tauri\Cargo.toml" p0e_read_persistent_worlddb_people_via_actual_tauri_person_adapter *> $rustLog
    $rustExit = $LASTEXITCODE

    Write-Host 'Installing JS dependencies for isolated GameWorld smoke...'
    & npm ci *> (Join-Path $folder 'npm-ci.log')
    $npmExit = $LASTEXITCODE

    $tsExit = -1
    if ($npmExit -eq 0) {
      Write-Host 'Checking P0E names from manifest via GameWorld and Save V4...'
      & "$worktree\node_modules\.bin\vitest.cmd" run src/app/game/WorldDbGameBootstrap.test.ts -t 'P0E persistent names flow' --maxWorkers=1 --no-file-parallelism --testTimeout=30000 *> $tsLog
      $tsExit = $LASTEXITCODE
    }
  } finally {
    Pop-Location
    Remove-Item Env:BDM_P0E_STAGE_DB -ErrorAction SilentlyContinue
    Remove-Item Env:BDM_P0E_MANIFEST -ErrorAction SilentlyContinue
  }

  $afterHash = (Get-FileHash -LiteralPath $P0EWorldDb -Algorithm SHA256).Hash
  $rustText = Get-Content -LiteralPath $rustLog -Raw
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
  $toZip = @($rustLog, $summaryPath)
  if (Test-Path -LiteralPath $tsLog) { $toZip += $tsLog }
  Compress-Archive -LiteralPath $toZip -DestinationPath $zip
  Write-Host "Bridge: $($summary.status)"
  Write-Host "ZIP: $zip"
  if (!$passed) { throw 'P0E GAME bridge was not certified, provide the ZIP to diagnose' }
  Write-Host 'P0E persisted PERSON reached Tauri and GameWorld/Save V4 fixture; roster activation NOT tested.' -ForegroundColor Green
} catch {
  Write-Host ('P0E GAME BRIDGE ERROR: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
