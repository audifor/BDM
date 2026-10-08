import { resolve } from 'node:path'
import { expect, it, vi } from 'vitest'
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { addDays, addYears, parseGameDate } from '@/domain/date'
import { getPlayerContractStatus } from '@/domain/contract'
import { validateGameWorld, type GameWorld } from '@/domain/world'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { SeededRandomSource } from '@/engine/random'
import { simulateUntilDate } from '@/app/game/simulateUntilDate'
import { assertCollegeRosterPermanentEligibility } from '@/engine/eligibility/CollegeEligibilityLifecycle'
import { getEligiblePlayersForCompetition, resolveCollegeRuleset } from '@/engine/eligibility'
import { resolveSimulationDetail } from '@/app/worldSim/SimulationResolutionPolicy'
import { readLargeSaveV4File, writeLargeSaveV4File } from './LargeSaveV4File'
import { createLongHorizonMutationGuard } from './LongHorizonMutationGuard'
import { assertLongHorizonIntegrity } from './TalentLongHorizonCertification'
import { collectNcaaContinuity } from './NcaaContinuityCertification'
import { snapshot, collectLongevityMetrics, assertAnnualIntegrity, assertEffectiveRules, memoryAfterGc, semanticDigest, verifyPersistedSave, generationalReplacement, cohortJourneyExamples, assertKnowledgeRankingFairness, recruitingForecasts } from './LongHorizonCheckpointAudit'

const tiers = vi.hoisted(() => ({ FULL: 0, STANDARD: 0, BACKGROUND: 0 }))
vi.mock('@/app/game/playUserGame', async original => {
  const actual = await original<typeof import('@/app/game/playUserGame')>()
  return { ...actual, simulateAndApplyGame: (...args: Parameters<typeof actual.simulateAndApplyGame>) => {
    tiers[resolveSimulationDetail(args[0], args[1], args[4])]++
    try { return actual.simulateAndApplyGame(...args) }
    catch (error) {
      if (process.env.BS15I_FINAL_LONG_HORIZON === '1') {
        writeLargeSaveV4File('C:/Temp/BS15I-failed-match-input-save-v4.json', serializeGameWorldV4(args[0], `${args[0].currentDate}T00:00:00.000Z`))
        writeFileSync('C:/Temp/BS15I-failed-match-input.json', JSON.stringify({ date: args[0].currentDate, game: args[1], reports: args[3], error: error instanceof Error ? error.message : String(error) }, null, 2))
      }
      throw error
    }
  } }
})
const directory = 'C:/Temp'
const rolling = `${directory}/BS15I-latest-valid-year-save-v4.json`
const journalPath = `${directory}/BS15I-final-long-horizon-progress.json`
type AnnualRow = ReturnType<typeof lightGate> & { saveBytes: number; saveMs: number; gateMs: number; phaseReport: Record<string, { ms: number; calls: number }>; gamesByTier: typeof tiers; memory: ReturnType<typeof memoryAfterGc> }

it('certifies canonical Y8 through Y30 with rolling recovery and three deep gates', async () => {
  if (process.env.BS15I_FINAL_LONG_HORIZON !== '1') return
  if (!memoryAfterGc().gcAvailable) throw new Error('Certification requires actual exposed GC')
  const sourcePath = process.env.BS15I_FINAL_LONG_SOURCE ?? `${directory}/BS15I-final-y7-save-v4.json`
  const prior = process.env.BS15I_FINAL_LONG_SOURCE && existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, 'utf8')) : undefined
  const annual: AnnualRow[] = prior?.annual ?? []
  const deepReports: Record<string, unknown> = prior?.deepReports ?? {}
  let world = load(sourcePath)
  const startYear = Number(world.currentDate.slice(0, 4)) - 2032
  if (startYear < 7 || startYear >= 30 || !world.currentDate.endsWith('-10-01')) throw new Error(`Invalid certified resume date ${world.currentDate}`)
  if (prior && (prior.latestValidYear !== startYear || resolve(prior.validPath) !== resolve(sourcePath))) throw new Error('Recovery journal does not match the selected checkpoint; preserve evidence and select its immediately valid Save')
  const completedGames = Object.values(world.games).filter(game => game.status === 'completed').length
  if (prior && prior.seedDraws !== completedGames) throw new Error('Recovery RNG offset disagrees with canonical completed games')
  let validPath = sourcePath
  let seedDraws = prior?.seedDraws ?? Object.values(world.games).filter(game => game.status === 'completed').length
  let validSeedDraws = seedDraws
  const seed = new SeededRandomSource(15015)
  for (let draw = 0; draw < seedDraws; draw++) seed.nextInt(0, 0xffff_ffff)
  let guard = createLongHorizonMutationGuard(world)
  const persist = (status: string, extra: object = {}) => writeFileSync(journalPath, JSON.stringify({ status, acceptedStart: `${directory}/BS15I-final-y7-save-v4.json`, validPath, latestValidYear: annual.at(-1)?.year ?? startYear, seedDraws: validSeedDraws, annual, deepReports, ...extra }, null, 2))
  persist('RUNNING')
  for (let year = startYear + 1; year <= 30; year++) {
    const from = world.currentDate
    const target = addYears(from, 1)
    const before = snapshot(world)
    const phases: AnnualRow['phaseReport'] = {}
    tiers.FULL = 0; tiers.STANDARD = 0; tiers.BACKGROUND = 0
    let simulationMs = 0, observerMs = 0
    const yearStarted = performance.now()
    try {
      while (world.currentDate < target) {
        const next = addDays(world.currentDate, 30)
        const chunkTarget = next < target ? next : target
        const batchStarted = performance.now()
        const result = simulateUntilDate(world, chunkTarget, () => { seedDraws++; return seed.nextInt(0, 0xffff_ffff) }, {
          onSeasonLifecycle: ms => { const phase = phases.SEASON_LIFECYCLE ??= { ms: 0, calls: 0 }; phase.ms += ms; phase.calls++ },
          onDayAdvance: day => {
            const started = performance.now()
            if (day.status === 'FAILED') throw new Error(`FIRST_INVALID_MUTATION ${JSON.stringify({ year, date: day.world.currentDate, failure: day.failure })}`)
            guard(day.world)
            for (const phase of day.phases) if (phase.ran && phase.elapsedMs !== undefined) { const total = phases[phase.phaseId] ??= { ms: 0, calls: 0 }; total.ms += phase.elapsedMs; total.calls++ }
            observerMs += performance.now() - started
          },
        })
        simulationMs += performance.now() - batchStarted
        world = result.world
        if (world.currentDate !== chunkTarget) throw new Error(`YEAR_STOP ${JSON.stringify({ year, date: world.currentDate, stop: result.stopReason })}`)
        process.stdout.write(`[BS15I final progress] ${JSON.stringify({ year, date: world.currentDate, elapsedMs: performance.now() - yearStarted, simulationMs: simulationMs - observerMs, players: Object.keys(world.players).length, rss: process.memoryUsage().rss })}\n`)
        await new Promise<void>(resolve => setTimeout(resolve, 0))
      }
      const gateStarted = performance.now()
      const light = lightGate(world, from, before.playerIds, simulationMs - observerMs, year)
      const gateMs = performance.now() - gateStarted
      const deep = [10, 20, 30].includes(year)
      if (deep) {
        validateGameWorld(world)
        assertAnnualIntegrity(world); assertLongHorizonIntegrity(world); assertEffectiveRules(world)
        const path = year === 30 ? `${directory}/BS15I-final-y30-save-v4.json` : `${directory}/BS15I-long-y${year}-save-v4.json`
        const digest = semanticDigest(world)
        const started = performance.now()
        writeLargeSaveV4File(path, serializeGameWorldV4(world, `${world.currentDate}T00:00:00.000Z`))
        const save = verifyPersistedSave(world, path, statSync(path).size, performance.now() - started, true, digest)
        if (!save.semanticRoundTrip) throw new Error(`Exact deep Save roundtrip failed Y${year}`)
        const metrics = collectLongevityMetrics(world, before, snapshot(world), light.runtimeMs, undefined, true)
        const report = { status: 'PASS', ...metrics, save, generations: generationalReplacement(world), journeys: cohortJourneyExamples(world), knowledgeSafety: assertKnowledgeRankingFairness(world), rules: Object.values(world.ecosystems).filter(item => item.kind === 'ncaaLike').map(item => ({ ecosystemId: item.id, currentDate: world.currentDate, effectiveRule: resolveCollegeRuleset(world, item.id, world.currentDate) })), recruitingForecasts: recruitingForecasts(world), ncaaContinuity: collectNcaaContinuity(world), rollingFiveYear: rollingFlows([...annual, light]), largestPersistedCollections: largestCollections(world), memoryAfterTemporaryReloadReleased: memoryAfterGc() }
        if (year >= 20 && report.rollingFiveYear.careerExits === 0) throw new Error(`No actual career exits in mature five-year window Y${year}`)
        if ((metrics.unrosteredClassification.groups?.unknown ?? 0) > 0) throw new Error(`Unclassified active sink at Y${year}`)
        deepReports[`Y${year}`] = report
        writeFileSync(`${directory}/BS15I-long-y${year}-deep.json`, JSON.stringify(report, null, 2))
      }
      // Atomic replacement only after every gate required for this year succeeds.
      const saveStarted = performance.now()
      const pending = `${rolling}.pending`
      writeLargeSaveV4File(pending, serializeGameWorldV4(world, `${world.currentDate}T00:00:00.000Z`))
      const saveBytes = statSync(pending).size
      renameSync(pending, rolling)
      validPath = rolling
      validSeedDraws = seedDraws
      const row: AnnualRow = { ...light, saveBytes, saveMs: performance.now() - saveStarted, gateMs, phaseReport: phases, gamesByTier: { ...tiers }, memory: memoryAfterGc() }
      annual.push(row)
      writeFileSync(`${directory}/BS15I-latest-valid-year.json`, JSON.stringify({ year, date: world.currentDate, path: rolling, bytes: saveBytes, seed: 15015, seedDraws }, null, 2))
      persist(year === 30 ? 'Y30_DEEP_PASS' : 'RUNNING')
      process.stdout.write(`[BS15I final annual PASS] ${JSON.stringify(row)}\n`)
      if (light.runtimeMs > 2 * 273383) process.stdout.write(`[BS15I performance investigation trigger] ${JSON.stringify({year,runtimeMs:light.runtimeMs})}\n`)
      // The next loop retains only the current world and scalar/ID reports.
      guard = createLongHorizonMutationGuard(world)
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    } catch (error) {
      persist('REPAIR_REQUIRED', { failedYear: year, failedDate: world.currentDate, failure: error instanceof Error ? error.message : String(error), resumeCheckpoint: validPath })
      throw error
    }
  }
  expect(world.currentDate).toBe(parseGameDate('2062-10-01'))
  expect(Object.keys(deepReports)).toEqual(['Y10', 'Y20', 'Y30'])
}, 48 * 60 * 60 * 1000)

function load(path: string): GameWorld { return deserializeGameWorldV4(readLargeSaveV4File(path)) }
export function lightGate(world: GameWorld, from: string, priorPlayerIds: ReadonlySet<string>, runtimeMs: number, year: number) {
  const players = Object.values(world.players), owners = new Map<string, string>()
  for (const player of players) if (!player.personId || !world.personsById[player.personId] || player.id !== world.players[player.id]?.id) throw new Error(`Orphan current Player/Person ${player.id}`)
  for (const team of Object.values(world.teams)) for (const id of team.rosterPlayerIds) {
    if (!world.players[id] || world.players[id]?.careerEnd || owners.has(id)) throw new Error(`Duplicate/orphan/retired roster ownership ${id}`)
    owners.set(id, team.id)
  }
  const activeContracts = new Set<string>()
  for (const contract of Object.values(world.contractsById)) {
    if (!world.players[contract.playerId] || !world.teams[contract.teamId]) throw new Error(`Orphan contract ${contract.id}`)
    const status = getPlayerContractStatus(contract, world.currentDate)
    if (['active','scheduled'].includes(status) && world.players[contract.playerId]?.careerEnd) throw new Error(`Retired contract ${contract.id}`)
    if (status === 'active') { if (activeContracts.has(contract.playerId) || owners.get(contract.playerId) !== contract.teamId) throw new Error(`Contract ownership ${contract.id}`); activeContracts.add(contract.playerId) }
  }
  const materialized = new Set(Object.values(world.talentMaterializationsByCandidateKey).map(item => item.playerId as string))
  const newPlayers = players.filter(item => !priorPlayerIds.has(item.id))
  if (newPlayers.some(item => !materialized.has(item.id))) throw new Error('Noncanonical synthetic new Player')
  assertCollegeRosterPermanentEligibility(world)
  let ncaaEnrolled = 0, ncaaEligible = 0, minimumEligible = Infinity
  for (const competition of Object.values(world.competitions)) {
    const season = Object.values(world.seasons).filter(item => item.competitionId === competition.id && item.startDate <= world.currentDate).sort((a,b) => b.startDate.localeCompare(a.startDate))[0]
      ?? Object.values(world.seasons).filter(item => item.competitionId === competition.id).sort((a,b) => a.startDate.localeCompare(b.startDate))[0]!
    for (const id of competition.participantTeamIds) {
      const eligible = getEligiblePlayersForCompetition(world, id, competition.id, season.id, world.currentDate).length
      if (eligible < 5) throw new Error(`Playable roster deficit ${id}: ${eligible}`)
      if (world.ecosystems[competition.ecosystemId]?.kind === 'ncaaLike') { ncaaEnrolled += Object.values(world.playerEnrollmentsById).filter(item => item.teamId === id && item.status === 'active' && item.startsOn <= world.currentDate && (item.endsOn === undefined || item.endsOn >= world.currentDate)).length; ncaaEligible += eligible; minimumEligible = Math.min(minimumEligible, eligible) }
    }
  }
  const inPeriod = (date: string) => date > from && date <= world.currentDate
  const enrollments = Object.values(world.playerEnrollmentsById).filter(item => world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')
  const admitted = new Set(Object.values(world.collegeEligibilityAssessmentsById).filter(item => item.eligible && item.evidence.enrollmentId !== undefined).map(item => item.evidence.enrollmentId!))
  const transitions = Object.values(world.ecosystemTransitionsById).filter(item => inPeriod(item.effectiveDate))
  const pro = new Set(Object.values(world.ecosystems).filter(item => item.kind === 'nbaLike' || item.kind === 'fibaLike').map(item => item.id))
  return { year, date: world.currentDate, persons: Object.keys(world.personsById).length, players: players.length, active: players.filter(item => !item.careerEnd).length, retired: players.filter(item => item.careerEnd).length, rostered: owners.size, activeUnrostered: players.filter(item => !item.careerEnd && !owners.has(item.id)).length, ncaaEnrolled, ncaaEligible, minimumEligible, teamsBelowMinimum: 0, newMaterialized: newPlayers.length, ncaaArrivals: enrollments.filter(item => inPeriod(item.startsOn) && admitted.has(item.id)).length, ncaaExits: enrollments.filter(item => item.status === 'ended' && item.endsOn && inPeriod(item.endsOn) && admitted.has(item.id)).length, portalMovements: Object.values(world.transferPortalEntriesById).filter(item => item.movement && inPeriod(item.movement.transferredOn)).length, draftEntries: Object.values(world.draftsById).filter(item => inPeriod(item.scheduledOn)).reduce((n,item) => n+(item.entries?.length ?? 0),0), drafted: Object.values(world.draftPicksById).filter(item => item.selection && inPeriod(world.draftsById[item.draftId]?.scheduledOn ?? '')).length, proTransitions: transitions.filter(item => pro.has(item.toEcosystemId)).length, walkOns: Object.values(world.playerTransactionsById).filter(item => item.kind === 'ncaaWalkOn' && inPeriod(item.occurredOn)).length, careerExits: players.filter(item => item.careerEnd && inPeriod(item.careerEnd.endedOn)).length, contracts: Object.keys(world.contractsById).length, duplicateOwnership: 0, orphanReferences: 0, permanentNcaaIneligibleRostered: 0, runtimeMs }
}
function rollingFlows(rows: readonly Pick<ReturnType<typeof lightGate>, 'year'|'newMaterialized'|'ncaaArrivals'|'ncaaExits'|'proTransitions'|'careerExits'>[]) {
  const historical = [6,7].flatMap(year => {
    const path = `${directory}/${year === 7 ? 'BS15I-final-y7-metrics' : 'BS15I-long-y6-metrics'}.json`
    if (!existsSync(path)) return []
    const checkpoint = JSON.parse(readFileSync(path, 'utf8')).checkpoints.at(-1)
    if (checkpoint.date !== `${2032+year}-10-01`) throw new Error('Historical five-year flow date mismatch')
    const flow = checkpoint.flowsSincePreviousCheckpoint
    return [{ year, newMaterialized: flow.newPlayers, ncaaArrivals: flow.ncaaArrivals, ncaaExits: flow.ncaaExits, proTransitions: flow.proEntries, careerExits: flow.retirementsOrCareerEnds }]
  })
  const last = [...historical,...rows].slice(-5)
  return { years: last.map(item => item.year), complete: last.length === 5, materializations: last.reduce((n,item)=>n+item.newMaterialized,0), ncaaArrivals: last.reduce((n,item)=>n+item.ncaaArrivals,0), ncaaExits: last.reduce((n,item)=>n+item.ncaaExits,0), proEntries: last.reduce((n,item)=>n+item.proTransitions,0), careerExits: last.reduce((n,item)=>n+item.careerExits,0) }
}

function largestCollections(world: GameWorld) {
  const payload = serializeGameWorldV4(world, `${world.currentDate}T00:00:00.000Z`).payload
  return Object.entries(payload).map(([name, value]) => ({ name, records: Array.isArray(value) ? value.length : undefined, bytes: Array.isArray(value) ? value.reduce((n: number, item: unknown) => n + Buffer.byteLength(JSON.stringify(item)) + 1, 2) : Buffer.byteLength(JSON.stringify(value) ?? 'null') })).sort((a,b) => b.bytes-a.bytes).slice(0,15)
}
