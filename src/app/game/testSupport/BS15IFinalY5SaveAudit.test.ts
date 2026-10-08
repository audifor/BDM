import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { expect, it } from 'vitest'
import { assertLongHorizonIntegrity, semanticSaveProjection, stableStringify } from './TalentLongHorizonCertification'
import { assertNcaaViability, collectNcaaContinuity } from './NcaaContinuityCertification'
import { deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import type { GameWorld } from '@/domain/world'

it('loads and audits the exact persisted Y5 Save V4 with post-GC memory', () => {
  const savePath = process.env.BS15I_FINAL_Y5_SAVE_PATH
  const metricsPath = process.env.BS15I_FINAL_Y5_METRICS_PATH
  if (savePath === undefined || metricsPath === undefined) throw new Error('Exact Y5 Save and checkpoint metrics paths must be configured')
  const metrics = JSON.parse(readFileSync(metricsPath, 'utf8')) as { checkpoints: Array<{ date: string; semanticDigest?: string; persistedSaveBytes?: number }> }
  const checkpoint = metrics.checkpoints.find(item => item.date === '2037-10-01')
  if (checkpoint === undefined || checkpoint.semanticDigest === undefined || checkpoint.persistedSaveBytes === undefined) throw new Error('Y5 checkpoint is missing persisted Save evidence or semantic digest')
  const fileBytes = statSync(savePath).size
  expect(fileBytes).toBe(checkpoint.persistedSaveBytes)

  let world: GameWorld = loadSave(savePath)
  expect(world.currentDate).toBe('2037-10-01')
  assertLongHorizonIntegrity(world)
  const ncaa = collectNcaaContinuity(world)
  assertNcaaViability(world)
  const semanticDigest = createHash('sha256').update(stableStringify(semanticSaveProjection(world))).digest('hex')
  expect(semanticDigest).toBe(checkpoint.semanticDigest)

  const playerIds = new Set(Object.keys(world.players))
  const rosteredIds = new Set(Object.values(world.teams).flatMap(team => team.rosterPlayerIds))
  const activePlayers = Object.values(world.players).filter(player => player.careerEnd === undefined)
  const report = {
    savePath,
    saveBytes: fileBytes,
    currentDate: world.currentDate,
    semanticDigest,
    memoryAfterGc: collectMemoryAfterGc(),
    collections: {
      persons: Object.keys(world.personsById).length,
      players: playerIds.size,
      active: activePlayers.length,
      retired: playerIds.size - activePlayers.length,
      activeUnrostered: activePlayers.filter(player => !rosteredIds.has(player.id)).length,
      talentMaterializations: Object.keys(world.talentMaterializationsByCandidateKey).length,
      enrollments: Object.values(world.playerEnrollmentsById).filter(item => item.status === 'active' && item.startsOn <= world.currentDate && (item.endsOn === undefined || item.endsOn >= world.currentDate)).length,
      ncaaEnrolled: ncaa.enrolled,
      ncaaEligible: ncaa.eligible,
      minimumEligibleRoster: Math.min(...ncaa.teams.map(team => team.eligible)),
      teamsBelowMinimum: ncaa.teams.filter(team => team.deficit > 0).length,
      contracts: Object.keys(world.contractsById).length,
      playerTransactions: Object.keys(world.playerTransactionsById).length,
      recruitingProfiles: Object.keys(world.recruitProfilesById).length,
      recruitSignings: Object.keys(world.recruitSigningsById).length,
      portalEntries: Object.keys(world.transferPortalEntriesById).length,
      drafts: Object.keys(world.draftsById).length,
      draftRights: Object.keys(world.playerRightsById).length,
      scheduledTrainingSessions: Object.keys(world.scheduledTrainingSessionsById).length,
      trainingSessions: Object.keys(world.trainingSessionsById).length,
      injuryRecords: Object.keys(world.injuriesById).length,
    },
  }
  process.stdout.write(`[BS15I final Y5 Save audit] ${JSON.stringify(report)}\n`)
}, 120_000)

function loadSave(path: string): GameWorld {
  const content = readFileSync(path, 'utf8')
  const envelope = JSON.parse(content)
  return deserializeGameWorldV4(envelope)
}

function collectMemoryAfterGc() {
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc
  if (gc === undefined) throw new Error('Run this focused audit in a test process with --expose-gc')
  gc()
  gc()
  const { heapUsed, heapTotal, rss, external, arrayBuffers } = process.memoryUsage()
  return { heapUsed, heapTotal, rss, external, arrayBuffers }
}
