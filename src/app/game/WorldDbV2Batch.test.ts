import { expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createWorldDbV2GameFromSnapshot } from './WorldDbV2Game'
import { createWorldDbV2UniverseFromSnapshots } from './WorldDbV2Universe'
import { WORLDDB_V2_COMPETITIONS } from './WorldDbV2Competitions'
import { worldDbV2FamilySignature } from './WorldDbV2Connection'
import { parseWorldCompetitionFormatDocument, parseWorldCompetitionRuntimeBundle } from '@/domain/competition'
import reference from '@/data/worlddb-v2/competition-runtime.json'
import additions from '@/data/worlddb-v2/additional-formats.json'
import { getFreeAgents, validateGameWorld } from '@/domain/world'
import { initializeFreeAgentMarketTruth } from '@/engine/market'
import { f3AdvanceDay, f3Store, f3World } from './testSupport/PlayableF3Support'
import { f3PlayDirectSigning } from './testSupport/PlayableF3TransferSupport'
import { serializeGameWorldV4, deserializeGameWorldSaveV4 } from '@/save/GameWorldSaveV4'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import type { WorldDbV2Snapshot } from '@/tauri/TauriWorldDbV2'

// A separate, explicit integration job. Ordinary CI does not require a developer's
// private source databases. Every row is checkpointed, including negative attempts.
it.skipIf(process.env.BDM_WORLDDB_BATCH !== '1')('attempts every initializable PBM competition without transferring rules or stopping on incompatibility', async () => {
  const directory = resolve('.worlddb-v2/batch-04')
  const index = JSON.parse(readFileSync(resolve(directory, 'index.json'), 'utf8'))
  const selectedIds = new Set((process.env.BDM_WORLDDB_BATCH_IDS ?? '').split(',').filter(Boolean))
  const rows = selectedIds.size ? index.results.filter((row: any) => selectedIds.has(row.source_id)) : index.results
  if (selectedIds.size) expect(rows).toHaveLength(selectedIds.size)
  const reports: Record<string, any>[] = []
  const base = parseWorldCompetitionRuntimeBundle(reference)
  const compiled = additions.map(parseWorldCompetitionFormatDocument)
  const trusted = new Map([...base.competitionFormats, ...compiled].map(f => [f.competitionSeasonId, f]))
  // Opt-in only: candidate formats are not published in NEW GAME. The batch
  // must exercise the full native game/market/save boundary for every PBM ID.
  const simulationMode = process.env.BDM_WORLDDB_SIMULATION_CANDIDATES === '1'
  const generatedDir = resolve('.worlddb-v2/generated-simulation-candidates')
  const candidateRows: any[] = simulationMode ? JSON.parse(readFileSync(resolve(generatedDir, 'candidate-competitions.json'), 'utf8')) : []
  const simulationDocs: ReturnType<typeof parseWorldCompetitionFormatDocument>[] = simulationMode
    ? (JSON.parse(readFileSync(resolve(generatedDir, 'simulation-formats.json'), 'utf8')) as unknown[]).map(parseWorldCompetitionFormatDocument)
    : []
  const candidateConfigs = new Map<string, any>(candidateRows.map(config => [config.sourceCompetitionId, config]))
  const simulationFormats = new Map(simulationDocs.map(doc => [doc.competitionSeasonId, doc]))
  if (simulationMode) {
    expect(candidateConfigs.size).toBe(102)
    expect(simulationFormats.size).toBe(96)
    expect(candidateRows.filter(config => config.formatProvenance === 'GENERATED_SIMULATION')).toHaveLength(96)
    const reused = candidateRows.filter(config => config.formatProvenance === 'REUSED_DOCUMENTED_FORMAT')
    expect(reused).toHaveLength(1)
    expect(reused[0].sourceCompetitionId).toBe('pbm:DYN_championnat:44')
    expect(reused[0].nativeCompetitionId).toBe('competition:NAM:nba')
    expect(trusted.has(reused[0].editionId)).toBe(true)
    const college = candidateRows.filter(config => config.formatProvenance === 'DOCUMENTED_NCAA_REFERENCE_UNRECONCILED')
    expect(college).toHaveLength(1)
    expect(college[0].sourceCompetitionId).toBe('pbm:DYN_championnat:71')
    const collegePlan = JSON.parse(readFileSync(resolve(generatedDir, 'ncaa-existing-rules-plan.json'), 'utf8'))
    expect(collegePlan.source_clubs).toBe(353)
    expect(collegePlan.reference_conferences).toBe(32)
    expect(collegePlan.reference_clubs).toBe(365)
    expect(collegePlan.team_membership).toBe('REQUIRES_SOURCE_IDENTITY_RECONCILIATION')
  }
  for (const row of rows) {
    const config = simulationMode ? candidateConfigs.get(row.source_id) : row.config
    const report: Record<string, any> = {
      ...row, config, native_projection: 'NOT_RUN', minimum_flow: 'NOT_RUN', status: 'BLOCKED',
      ...(simulationMode ? { format_mode: config?.formatProvenance === 'GENERATED_SIMULATION'
        ? 'GENERATED_SIMULATION_CANDIDATE' : config?.formatProvenance === 'REUSED_DOCUMENTED_FORMAT'
          ? 'REUSED_DOCUMENTED_FORMAT_CANDIDATE' : 'VERIFIED_EXISTING' } : {}),
    }
    try {
      if (row.source_build !== 'PASS') throw Error('Runtime source build failed: ' + row.source_error)
      const snapshot = JSON.parse(readFileSync(row.snapshotPath, 'utf8')) as WorldDbV2Snapshot
      // Even unmapped selections reach the real native factory with their original
      // population; missing identity/rules fail at the actual repository contract.
      if (!config) throw Error('Missing candidate configuration: ' + row.source_id)
      if (simulationMode && config.formatProvenance === 'DOCUMENTED_NCAA_REFERENCE_UNRECONCILED') {
        // 353 PBM NCAA programs cannot become a single 124256-game round robin.
        // The existing NCAA engine requires real/proven conference memberships,
        // not 2026-27 reference counts (365) guessed onto a historical PBM cohort.
        report.ncaa_structure = 'EXISTING_NCAA_CONFERENCES_NOT_YET_LINKED'
        throw Error('NCAA_353: source conference memberships must be reconciled before native college GameWorld; never use generic ROUND_ROBIN')
      }
      const document = simulationFormats.get(config.editionId) ?? trusted.get(config.editionId)
        ?? (row.formatPath && !simulationMode ? parseWorldCompetitionFormatDocument(JSON.parse(readFileSync(row.formatPath, 'utf8'))) : undefined)
      if (simulationMode && config.formatProvenance === 'REUSED_DOCUMENTED_FORMAT' && !trusted.has(config.editionId)) {
        throw Error('Referenced documented format is not available in the runtime bundle: ' + row.source_id)
      }
      if (simulationMode && config.formatProvenance === 'GENERATED_SIMULATION' && !simulationFormats.has(config.editionId)) {
        throw Error('Generated simulation edition has no matching explicit document: ' + row.source_id)
      }
      const runtime = { ...base, competitionFormats: [...trusted.values(), ...(document && !trusted.has(document.competitionSeasonId) ? [document] : [])] }
      let world = await createWorldDbV2GameFromSnapshot(snapshot, snapshot.clubs[0]!.entity_id, undefined, config, runtime)
      report.native_projection = 'PASS'
      validateGameWorld(world)
      expect(Object.keys(world.teams).sort()).toEqual(snapshot.clubs.map(c => c.entity_id).sort())
      if (simulationMode && config.formatProvenance === 'GENERATED_SIMULATION') {
        // Candidate simulation must retain every eligible original PBM player,
        // and only supplement the source where the playable floor is missing.
        expect(Object.values(world.teams).every(team => team.rosterPlayerIds.length >= 5))
          .toBe(true)
        const originalPlayers = snapshot.people
          .filter(person => person.source_table === 'DYN_joueur'
            && person.reference_data.is_alive !== 0
            && person.reference_data.retraite !== 1)
          .map(person => person.entity_id)
        // PBM source IDs arrive as strings, while GameWorld.players is keyed
        // by branded PlayerId. Compare identity sets without an unsafe cast.
        const projectedPlayerIds = new Set(Object.keys(world.players))
        expect(originalPlayers.every(playerId => projectedPlayerIds.has(playerId)))
          .toBe(true)
        report.original_player_count = originalPlayers.length
        report.generated_player_count = Object.keys(world.players)
          .filter(playerId => playerId.startsWith('bdm:generated-player:')).length
      }
      const season = world.seasons[world.currentSeasonId!]!
      if (simulationMode && config.formatProvenance === 'GENERATED_SIMULATION') {
        expect(season.worldCompetitionFormat?.notes).toContain('GENERATED_SIMULATION')
        expect(season.worldCompetitionFormat?.variants[0]?.isRealVariant).toBe(false)
      }
      expect(season.worldCompetitionFormat?.competitionId).toBe(config.nativeCompetitionId)
      expect(season.worldCompetitionFormat?.status).toBe('COMPLETE')
      expect(Object.keys(world.games).length).toBeGreaterThan(0)
      const ids = Object.keys(world.players).sort()
      const truth = initializeFreeAgentMarketTruth(world, getFreeAgents(world).map(p => p.id))
      const candidates = getFreeAgents(truth).filter(p => truth.marketRealityByPlayerId[p.id]!.playerWillingness >= 50)
        .sort((a, b) => truth.marketRealityByPlayerId[a.id]!.expectedSalary - truth.marketRealityByPlayerId[b.id]!.expectedSalary)
      const attempts = []
      let signed = false
      if (simulationMode && config.formatProvenance === 'GENERATED_SIMULATION') {
        // Initial-connect acceptance: do not require a free-agent market in a
        // country whose PBM source has no eligible original free agents.
        // A real game must still be decided by MatchEngine via the day boundary.
        f3Store().replaceWorld(world)
        const fixture = Object.values(world.games)
          .filter(g => g.homeTeamId === snapshot.clubs[0]!.entity_id || g.awayTeamId === snapshot.clubs[0]!.entity_id)
          .sort((a, b) => a.date.localeCompare(b.date))[0]
        expect(fixture, 'Original PBM club must have a scheduled fixture').toBeDefined()
        const daysUntilFixture = Math.max(0, Math.round(
          (Date.parse(fixture!.date + 'T00:00:00Z') - Date.parse(world.currentDate + 'T00:00:00Z')) / 86_400_000,
        ))
        expect(daysUntilFixture, 'Initial fixture outside a one-year season').toBeLessThan(365)
        for (let day = 0; day <= daysUntilFixture + 1; day++) {
          if (Object.keys(f3World().matchStatLogsByGameId).length > 0) break
          f3AdvanceDay()
        }
        world = f3World()
        report.market_flow = 'NOT_TESTED_NO_ORIGINAL_FREE_AGENT_REQUIREMENT'
      } else {
        for (const player of candidates.slice(0, 6)) {
          f3Store().replaceWorld(world)
          const result = f3PlayDirectSigning(player.id, { salaryShare: 1.1, years: 1, role: 'ROTATION' })
          attempts.push({ playerId: player.id, status: result.status, stoppedAt: result.stoppedAt })
          if (result.status === 'SIGNED') { world = f3World(); signed = true; break }
        }
        expect(signed, JSON.stringify(attempts)).toBe(true)
        report.market_flow = 'PASS'
      }
      expect(Object.keys(world.matchStatLogsByGameId).length).toBeGreaterThan(0)
      expect(Object.keys(world.players).sort()).toEqual(ids)
      validateGameWorld(world)
      const save = serializeGameWorldV4(world, '2026-10-26T12:00:00Z')
      const savePath = resolve(directory, row.source_id.replaceAll(':', '-'), 'managed.json')
      mkdirSync(resolve(savePath, '..'), { recursive: true })
      writeFileSync(savePath, JSON.stringify(save))
      const reopened = deserializeGameWorldSaveV4(JSON.parse(readFileSync(savePath, 'utf8')))
      expect(projectPersistentWorldTruth(reopened)).toEqual(projectPersistentWorldTruth(world))
      report.minimum_flow = 'PASS'
      report.family_signature = worldDbV2FamilySignature(season.worldCompetitionFormat!)
      report.status = simulationMode && config.formatProvenance === 'GENERATED_SIMULATION'
        ? 'SIMULATION_CANDIDATE_MATCH_SAVE_PASS_NATIVE_PENDING'
        : 'ENGINE_CERTIFIED_NATIVE_ACCEPTANCE_SEPARATE'
      report.proof = { sourceClubs: snapshot.clubs.length, retainedPeople: ids.length, initialGames: Object.keys(world.games).length,
        actas: Object.keys(world.matchStatLogsByGameId).length, signed, attempts, savePath,
        format: season.worldCompetitionFormat }
    } catch (error) {
      report.blocker = error instanceof Error ? error.message : String(error)
      report.status = report.ncaa_structure === 'EXISTING_NCAA_CONFERENCES_NOT_YET_LINKED'
        ? 'NCAA_EXISTING_RULES_MEMBERSHIP_PENDING'
        : row.identity_scope === 'RESEARCH_ONLY' ? 'MAPPED_RESEARCH_ONLY' : row.identityEvidence ? 'PARTIAL_CONNECTION' : 'NEEDS_MAPPING'
    }
    reports.push(report)
    writeFileSync(resolve(directory, selectedIds.size ? 'native-results-retry.json' : 'native-results.json'), JSON.stringify({ total: reports.length, results: reports }, null, 2))
    console.log(row.source_id, report.status, report.blocker ?? '')
  }
  expect(reports).toHaveLength(selectedIds.size || 102)
  for (const config of WORLDDB_V2_COMPETITIONS.filter(config => !selectedIds.size || selectedIds.has(config.sourceCompetitionId))) expect(reports.find(r => r.source_id === config.sourceCompetitionId)?.minimum_flow).toBe('PASS')
}, 7_200_000)

it.skipIf(process.env.BDM_WORLDDB_BATCH_FAMILIES !== '1')('indexes families from certified persisted formats without replaying matches', () => {
  const path = resolve('.worlddb-v2/batch-04/native-results.json')
  const report = JSON.parse(readFileSync(path, 'utf8'))
  expect(report.results).toHaveLength(102)
  for (const row of report.results) {
    if (row.minimum_flow !== 'PASS') continue
    const format = parseWorldCompetitionFormatDocument(row.proof.format)
    expect(format.competitionId).toBe(row.config.nativeCompetitionId)
    row.family_signature = worldDbV2FamilySignature(format)
  }
  writeFileSync(path, JSON.stringify(report, null, 2))
})

it.skipIf(process.env.BDM_WORLDDB_SIMULATION_UNIVERSE !== '1')('assembles two source-original simulation candidates into one real shared GameWorld', async () => {
  const directory = resolve('.worlddb-v2/batch-04')
  const index = JSON.parse(readFileSync(resolve(directory, 'index.json'), 'utf8')) as {
    results: { source_id: string; source_build: string; snapshotPath?: string }[]
  }
  const generated = resolve('.worlddb-v2/generated-simulation-candidates')
  const configurations = JSON.parse(readFileSync(resolve(generated, 'candidate-competitions.json'), 'utf8')) as any[]
  const documents = JSON.parse(readFileSync(resolve(generated, 'simulation-formats.json'), 'utf8')) as unknown[]
  const originals = parseWorldCompetitionRuntimeBundle(reference)
  const runtimeBundle = {
    ...originals,
    competitionFormats: [...originals.competitionFormats, ...additions.map(parseWorldCompetitionFormatDocument),
      ...documents.map(parseWorldCompetitionFormatDocument)],
  }
  // Keep the acceptance compact. A 353-club stress-test belongs in the
  // separate full-universe scalability job, not this two-league smoke.
  const possible = index.results
    .filter(row => row.source_build === 'PASS' && row.snapshotPath !== undefined)
    .filter(row => configurations.some(config => config.sourceCompetitionId === row.source_id
      && config.formatProvenance === 'GENERATED_SIMULATION' && config.teamCount >= 5 && config.teamCount <= 16))
    .sort((a, b) => a.source_id.localeCompare(b.source_id))
  expect(possible.length).toBeGreaterThanOrEqual(2)
  const selected = possible.slice(0, 2)
  const snapshots = selected.map(row => JSON.parse(readFileSync(resolve(row.snapshotPath!), 'utf8')) as WorldDbV2Snapshot)
  const master = snapshots[0]!.manifest.master.sha256
  expect(snapshots.every(s => s.manifest.master.sha256 === master
    && s.manifest.configuration.start_date === snapshots[0]!.manifest.configuration.start_date
    && s.manifest.configuration.seed === snapshots[0]!.manifest.configuration.seed)).toBe(true)
  const world = await createWorldDbV2UniverseFromSnapshots(snapshots, snapshots[0]!.clubs[0]!.entity_id, undefined, {
    configurations, runtimeBundle,
  })
  validateGameWorld(world)
  expect(world.worldDbCompetitionRuntime?.worldDbV2?.activeCompetitionIds).toEqual(selected.map(row => row.source_id))
  expect(Object.keys(world.teams).length).toBe(snapshots.reduce((sum, snapshot) => sum + snapshot.clubs.length, 0))
  const save = serializeGameWorldV4(world, '2026-10-30T12:00:00Z')
  const recovered = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(save)))
  expect(projectPersistentWorldTruth(recovered)).toEqual(projectPersistentWorldTruth(world))
}, 1_200_000)
