import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { deserializeGameWorldV4, serializeGameWorldV4, type SaveGameEnvelopeV4 } from '@/save/GameWorldSaveV4'
import { readLargeSaveV4File } from './LargeSaveV4File'
import { assertLongHorizonIntegrity, stableStringify } from './TalentLongHorizonCertification'
import { collectNcaaContinuity } from './NcaaContinuityCertification'

it('isolates the saved scale Y7 roundtrip without resimulating the year', () => {
  if (process.env.BS15I_SCALE_Y7_SAVE_REPLAY !== '1') return
  const { world, ncaa, differences } = verifySavedY7()
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc
  gc?.()
  gc?.()
  const memory = process.memoryUsage()
  const players = Object.values(world.players)
  const report = {
    date: world.currentDate, integrity: true, semanticRoundTrip: differences.length === 0, differences,
    ncaa, postGc: gc !== undefined, memory,
    population: { players: players.length, persons: Object.keys(world.personsById).length, active: players.filter(player => player.careerEnd === undefined).length, careerEnded: players.filter(player => player.careerEnd !== undefined).length, rostered: new Set(Object.values(world.teams).flatMap(team => team.rosterPlayerIds)).size },
    collections: { games: Object.keys(world.games).length, completedGames: Object.values(world.games).filter(game => game.status === 'completed').length, matchHistory: Object.keys(world.matchStatLogsByGameId).length, playerContracts: Object.keys(world.contractsById).length, staffContracts: Object.keys(world.staffContractsById).length, drafts: Object.keys(world.draftsById).length, portal: Object.keys(world.transferPortalEntriesById).length, materializations: Object.keys(world.talentMaterializationsByCandidateKey).length, trainingSessions: Object.keys(world.scheduledTrainingSessionsById).length },
  }
  writeFileSync('C:/Temp/BS15I-scale-y7-certified.json', JSON.stringify(report, null, 2))
  process.stdout.write(`[BS15I scale Save replay] ${JSON.stringify({ date: world.currentDate, differences, memory, population: report.population })}\n`)
  expect(differences).toEqual([])
}, 120_000)

function verifySavedY7() {
  const envelope = readLargeSaveV4File('C:/Temp/BS15I-fast-y7-save-v4.json') as SaveGameEnvelopeV4
  const world = deserializeGameWorldV4(envelope)
  assertLongHorizonIntegrity(world)
  const ncaa = collectNcaaContinuity(world)
  expect(ncaa.teams.filter(team => team.deficit > 0)).toEqual([])
  const restored = serializeGameWorldV4(world, envelope.savedAt)
  expect(Object.keys(restored.payload).sort()).toEqual(Object.keys(envelope.payload).sort())
  const digest = (value: unknown) => createHash('sha256').update(stableStringify(value) ?? '<undefined>').digest('hex')
  const normalize = (key: string, value: unknown) => (key === 'personalities' || key === 'morale') && Array.isArray(value)
    ? [...value].sort((a,b) => String(a.coachId ?? a.personId).localeCompare(String(b.coachId ?? b.personId))) : value
  const differences: unknown[] = []
  for (const key of Object.keys(envelope.payload)) {
    const before = normalize(key, envelope.payload[key as keyof typeof envelope.payload])
    const after = normalize(key, restored.payload[key as keyof typeof restored.payload])
    if (Array.isArray(before) && Array.isArray(after)) {
      const changed = before.flatMap((item, index) => digest(item) === digest(after[index]) ? [] : [{ index, before: item, after: after[index] }])
      if (changed.length || before.length !== after.length) differences.push({ key, beforeCount: before.length, afterCount: after.length, changedCount: changed.length, examples: changed.slice(0, 2) })
    } else if (digest(before) !== digest(after)) differences.push({ key, before, after })
  }
  writeFileSync('C:/Temp/BS15I-scale-y7-roundtrip-repro.json', JSON.stringify({ date: world.currentDate, integrity: true, ncaa, differences }, null, 2))
  return { world, ncaa, differences }
}
