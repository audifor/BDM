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
import { f3Store, f3World } from './testSupport/PlayableF3Support'
import { f3PlayDirectSigning } from './testSupport/PlayableF3TransferSupport'
import { serializeGameWorldV4, deserializeGameWorldSaveV4 } from '@/save/GameWorldSaveV4'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import type { WorldDbV2Snapshot } from '@/tauri/TauriWorldDbV2'

// A separate, explicit integration job. Ordinary CI does not require a developer's
// private source databases. Every row is checkpointed, including negative attempts.
it.skipIf(process.env.BDM_WORLDDB_BATCH !== '1')('attempts every initializable PBM competition without transferring rules or stopping on incompatibility', async () => {
  const directory = resolve('.worlddb-v2/batch-04')
  const index = JSON.parse(readFileSync(resolve(directory, 'index.json'), 'utf8'))
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
    expect(simulationFormats.size).toBe(98)
    expect(candidateRows.filter(config => config.formatProvenance === 'GENERATED_SIMULATION')).toHaveLength(98)
  }
  for (const row of index.results) {
    const config = simulationMode ? candidateConfigs.get(row.source_id) : row.config
    const report: Record<string, any> = {
      ...row, config, native_projection: 'NOT_RUN', minimum_flow: 'NOT_RUN', status: 'BLOCKED',
      ...(simulationMode ? { format_mode: config?.formatProvenance === 'GENERATED_SIMULATION'
        ? 'GENERATED_SIMULATION_CANDIDATE' : 'VERIFIED_EXISTING' } : {}),
    }
    try {
      if (row.source_build !== 'PASS') throw Error('Runtime source build failed: ' + row.source_error)
      const snapshot = JSON.parse(readFileSync(row.snapshotPath, 'utf8')) as WorldDbV2Snapshot
      // Even unmapped selections reach the real native factory with their original
      // population; missing identity/rules fail at the actual repository contract.
      if (!config) throw Error('Missing candidate configuration: ' + row.source_id)
      const document = simulationFormats.get(config.editionId) ?? trusted.get(config.editionId)
        ?? (row.formatPath && !simulationMode ? parseWorldCompetitionFormatDocument(JSON.parse(readFileSync(row.formatPath, 'utf8'))) : undefined)
      if (simulationMode && config.formatProvenance === 'GENERATED_SIMULATION' && !simulationFormats.has(config.editionId)) {
        throw Error('Generated simulation edition has no matching explicit document: ' + row.source_id)
      }
      const runtime = { ...base, competitionFormats: [...trusted.values(), ...(document && !trusted.has(document.competitionSeasonId) ? [document] : [])] }
      let world = await createWorldDbV2GameFromSnapshot(snapshot, snapshot.clubs[0]!.entity_id, undefined, config, runtime)
      report.native_projection = 'PASS'
      validateGameWorld(world)
      expect(Object.keys(world.teams).sort()).toEqual(snapshot.clubs.map(c => c.entity_id).sort())
      const season = world.seasons[world.currentSeasonId!]!
      expect(season.worldCompetitionFormat?.competitionId).toBe(config.nativeCompetitionId)
      expect(season.worldCompetitionFormat?.status).toBe('COMPLETE')
      expect(Object.keys(world.games).length).toBeGreaterThan(0)
      const ids = Object.keys(world.players).sort()
      const truth = initializeFreeAgentMarketTruth(world, getFreeAgents(world).map(p => p.id))
      const candidates = getFreeAgents(truth).filter(p => truth.marketRealityByPlayerId[p.id]!.playerWillingness >= 50)
        .sort((a, b) => truth.marketRealityByPlayerId[a.id]!.expectedSalary - truth.marketRealityByPlayerId[b.id]!.expectedSalary)
      const attempts = []
      let signed = false
      for (const player of candidates.slice(0, 6)) {
        f3Store().replaceWorld(world)
        const result = f3PlayDirectSigning(player.id, { salaryShare: 1.1, years: 1, role: 'ROTATION' })
        attempts.push({ playerId: player.id, status: result.status, stoppedAt: result.stoppedAt })
        if (result.status === 'SIGNED') { world = f3World(); signed = true; break }
      }
      expect(signed, JSON.stringify(attempts)).toBe(true)
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
      report.status = 'ENGINE_CERTIFIED_NATIVE_ACCEPTANCE_SEPARATE'
      report.proof = { sourceClubs: snapshot.clubs.length, retainedPeople: ids.length, initialGames: Object.keys(world.games).length,
        actas: Object.keys(world.matchStatLogsByGameId).length, signed, attempts, savePath,
        format: season.worldCompetitionFormat }
    } catch (error) {
      report.blocker = error instanceof Error ? error.message : String(error)
      report.status = row.identity_scope === 'RESEARCH_ONLY' ? 'MAPPED_RESEARCH_ONLY' : row.identityEvidence ? 'PARTIAL_CONNECTION' : 'NEEDS_MAPPING'
    }
    reports.push(report)
    writeFileSync(resolve(directory, 'native-results.json'), JSON.stringify({ total: reports.length, results: reports }, null, 2))
    console.log(row.source_id, report.status, report.blocker ?? '')
  }
  expect(reports).toHaveLength(102)
  for (const config of WORLDDB_V2_COMPETITIONS) expect(reports.find(r => r.source_id === config.sourceCompetitionId)?.minimum_flow).toBe('PASS')
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
