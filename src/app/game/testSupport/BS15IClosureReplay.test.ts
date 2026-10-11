import { createHash } from 'node:crypto'
import { Session } from 'node:inspector'
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs'
import { it, expect } from 'vitest'
import { addDays, parseGameDate } from '@/domain/date'
import { calculateAge } from '@/domain/player'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { SeededRandomSource } from '@/engine/random'
import { simulateUntilDate } from '@/app/game/simulateUntilDate'
import type { GameWorld } from '@/domain/world'
import { createLongHorizonMutationGuard } from './LongHorizonMutationGuard'
import { runTalentLongHorizonCertification } from './TalentLongHorizonCertification'

it('traces canonical Y5 departures or measures the same seven production days', async () => {
  const mode = process.env.BS15I_CLOSURE_REPLAY
  if (!mode) return
  const path = process.env.BS15I_CLOSURE_RESUME ?? 'C:/Temp/BS15I-final-y5-save-v4.json'
  const log = `C:/Temp/BS15I-closure-${mode}.jsonl`
  const emit = (value: unknown) => { appendFileSync(log, `${JSON.stringify(value)}\n`); process.stdout.write(`${JSON.stringify(value)}\n`) }
  writeFileSync(log, '')
  let world = deserializeGameWorldV4(JSON.parse(readFileSync(path, 'utf8')))
  if (mode === 'ab') {
    const draws = Object.values(world.games).filter(game => game.status === 'completed').length
    const target = addDays(world.currentDate, 7)
    const initial = world
    const seed = new SeededRandomSource(15015)
    for (let i = 0; i < draws; i++) seed.nextInt(0, 0xffff_ffff)
    const digest = completeSavePayloadDigest
    const startedA = performance.now()
    const production = simulateUntilDate(initial, target, () => seed.nextInt(0, 0xffff_ffff))
    const elapsedA = performance.now() - startedA
    expect(production.world.currentDate).toBe(target)
    const signatureA = digest(production.world)
    const guard = createLongHorizonMutationGuard(initial)
    const startedB = performance.now()
    const certification = await runTalentLongHorizonCertification({ world: initial, targetDate: target, seed: 15015, initialSeedDraws: draws, onDayAdvance: day => { if (day.status === 'FAILED') throw new Error(JSON.stringify(day.failure)); guard(day.world) } })
    const elapsedB = performance.now() - startedB
    expect(certification.world.currentDate).toBe(target)
    expect(digest(certification.world)).toBe(signatureA)
    emit({ type: 'ab', startDate: initial.currentDate, target, productionMs: elapsedA, longevityMs: elapsedB, overheadPercent: (elapsedB / elapsedA - 1) * 100, matchingResults: true })
    return
  }
  const id = 'generated-team-0017' as keyof GameWorld['teams']
  emit({ type: 'baseline', date: world.currentDate, roster: world.teams[id]!.rosterPlayerIds.map(playerId => {
    const player = world.players[playerId]!
    return { playerId, personId: player.personId, dob: player.bio.dateOfBirth, age: calculateAge(player.bio.dateOfBirth, world.currentDate), pathway: player.pathwayHistory, enrollments: Object.values(world.playerEnrollmentsById).filter(item => item.playerId === playerId) }
  }), cohorts: Object.values(world.talentCohortsById).map(item => ({ id: item.id, birthYear: item.birthYear, generationYear: item.generationYear })) })
  const draws = Object.values(world.games).filter(game => game.status === 'completed').length
  const seed = new SeededRandomSource(15015)
  for (let index = 0; index < draws; index++) seed.nextInt(0, 0xffff_ffff)
  const target = mode === 'trace' ? parseGameDate('2038-10-02') : addDays(world.currentDate, mode === 'phase' ? 3 : 7)
  let roster = world.teams[id]!.rosterPlayerIds
  const observer = { onDayAdvance: (day: import('@/app/game/advanceGameDay').WorldDayAdvanceResult) => {
    if (mode === 'phase') emit({ type: 'phases', date: day.world.currentDate, phases: day.phases.filter(phase => phase.elapsedMs !== undefined).map(phase => ({id:phase.phaseId,ms:phase.elapsedMs})).sort((a,b)=>b.ms!-a.ms!) })
    if (day.status === 'FAILED') throw new Error(JSON.stringify(day.failure))
    const next = day.world.teams[id]!.rosterPlayerIds
    const departed = roster.filter(playerId => !next.includes(playerId))
    if (departed.length || next.some(playerId => !roster.includes(playerId))) emit({ type: 'mutation', date: day.world.currentDate, before: roster, after: next, departed: departed.map(playerId => ({ playerId, personId: day.world.players[playerId]!.personId, transactions: Object.values(day.world.playerTransactionsById).filter(item => item.playerId === playerId), transitions: Object.values(day.world.ecosystemTransitionsById).filter(item => item.playerId === playerId), enrollments: Object.values(day.world.playerEnrollmentsById).filter(item => item.playerId === playerId) })), repair: day.repairReports.filter(item => item.targetEntity === id) })
    roster = next
    if (day.world.currentDate.endsWith('-01')) emit({ type: 'progress', date: day.world.currentDate })
  } }
  const profiler = mode === 'profile' ? new Session() : undefined
  if (profiler) {
    profiler.connect()
    await new Promise<void>((resolve, reject) => profiler.post('Profiler.enable', error => error ? reject(error) : resolve()))
    await new Promise<void>((resolve, reject) => profiler.post('Profiler.start', error => error ? reject(error) : resolve()))
  }
  const start = performance.now()
  if (mode === 'harness') {
    const result = await runTalentLongHorizonCertification({ world, targetDate: target, seed: 15015, initialSeedDraws: draws, onDayAdvance: observer.onDayAdvance })
    world = result.world
    expect(result.stopReason).toBeUndefined()
  } else {
    while (world.currentDate < target) {
      const chunkTarget = target < addDays(world.currentDate, 30) ? target : addDays(world.currentDate, 30)
      const result = simulateUntilDate(world, chunkTarget, () => seed.nextInt(0, 0xffff_ffff), observer)
      world = result.world
      expect(world.currentDate, JSON.stringify(result.stopReason)).toBe(chunkTarget)
      if (mode === 'trace') writeFileSync('C:/Temp/BS15I-closure-replay-latest-save-v4.json', JSON.stringify(serializeGameWorldV4(world, `${world.currentDate}T00:00:00.000Z`)))
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }
  if (profiler) {
    const profile = await new Promise<unknown>((resolve, reject) => profiler.post('Profiler.stop', (error, result) => error ? reject(error) : resolve(result.profile)))
    writeFileSync('C:/Temp/BS15I-production-worker.cpuprofile', JSON.stringify(profile))
    profiler.disconnect()
  }
  emit({ type: 'complete', mode, date: world.currentDate, elapsedMs: performance.now() - start, completeSavePayloadDigest: completeSavePayloadDigest(world) })
  expect(world.currentDate).toBe(target)
}, 12 * 60 * 60 * 1000)

function completeSavePayloadDigest(world: GameWorld) {
  const digest = createHash('sha256')
  const payload = serializeGameWorldV4(world, `${world.currentDate}T00:00:00.000Z`).payload
  for (const [key, value] of Object.entries(payload)) {
    digest.update(key)
    if (Array.isArray(value)) for (const record of value) digest.update(JSON.stringify(record)).update('\n')
    else digest.update(JSON.stringify(value)).update('\n')
  }
  return digest.digest('hex')
}
