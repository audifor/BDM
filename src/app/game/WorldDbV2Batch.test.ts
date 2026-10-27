import { expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createWorldDbV2GameFromSnapshot } from './WorldDbV2Game'
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
  for (const row of index.results) {
    const report: Record<string, any> = { ...row, native_projection: 'NOT_RUN', minimum_flow: 'NOT_RUN', status: 'BLOCKED' }
    try {
      if (row.source_build !== 'PASS') throw Error('Runtime source build failed: ' + row.source_error)
      const snapshot = JSON.parse(readFileSync(row.snapshotPath, 'utf8')) as WorldDbV2Snapshot
      // Even unmapped selections reach the real native factory with their original
      // population; missing identity/rules fail at the actual repository contract.
      const document = trusted.get(row.config.editionId)
        ?? (row.formatPath ? parseWorldCompetitionFormatDocument(JSON.parse(readFileSync(row.formatPath, 'utf8'))) : undefined)
      const runtime = { ...base, competitionFormats: [...trusted.values(), ...(document && !trusted.has(document.competitionSeasonId) ? [document] : [])] }
      let world = await createWorldDbV2GameFromSnapshot(snapshot, snapshot.clubs[0]!.entity_id, undefined, row.config, runtime)
      report.native_projection = 'PASS'
      validateGameWorld(world)
      expect(Object.keys(world.teams).sort()).toEqual(snapshot.clubs.map(c => c.entity_id).sort())
      const season = world.seasons[world.currentSeasonId!]!
      expect(season.worldCompetitionFormat?.competitionId).toBe(row.config.nativeCompetitionId)
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
