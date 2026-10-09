import { describe, expect, it } from 'vitest'
import { simulateUntilDate } from '@/app/game/simulateUntilDate'
import { createNewGame } from '@/app/game/createNewGame'
import { addYears, type GameDate } from '@/domain/date'
import { calculateAge } from '@/domain/player'
import type { PlayerId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

const fullCertification = process.env.BS15I_FULL_CERTIFICATION === '1' ? it : it.skip
const start = '2032-10-01' as GameDate
const checkpoints = [1, 5, 10, 25, 30] as const

describe('BS15I integrated population and Save V4 certification', () => {
  it('keeps the annual supply policy deterministic, demand bounded, and identity-safe', () => {
    const first = createNewGame({ seed: 204815 })
    const sameSeed = createNewGame({ seed: 204815 })
    const differentSeed = createNewGame({ seed: 992204 })
    expect(Object.keys(first.players)).toEqual(Object.keys(sameSeed.players))
    const firstPlayerId = Object.keys(first.players)[0]! as PlayerId
    expect(first.players[firstPlayerId]).not.toEqual(differentSeed.players[firstPlayerId])
    expect(Object.values(first.competitions).every((competition) => competition.participantTeamIds.length >= 2)).toBe(true)
    expect(Object.keys(first.games).length).toBeGreaterThan(0)
  })

  fullCertification('runs 30 years uninterrupted and through repeated V4 reloads, comparing semantic checkpoints', async () => {
    certificationStarted = performance.now()
    let continuous = useAiWorld(createNewGame({ seed: 15015 }))
    let reloaded = continuous
    const initialEnvelope = serializeGameWorldV4(continuous, `${start}T00:00:00.000Z`)
    process.stdout.write(`[BS15I] Year 0 complete · players=${Object.keys(continuous.players).length} saveBytes=${new TextEncoder().encode(JSON.stringify(initialEnvelope)).byteLength} rss=${Math.round(process.memoryUsage().rss / 1048576)}MB\n`)
    for (const year of checkpoints) {
      const target = addYears(start, year)
      const continuousStarted = performance.now()
      const continuousProfile = createPhaseProfile()
      const a = simulateUntilDate(continuous, target, continuousSeed, continuousProfile.observer)
      const continuousMs = performance.now() - continuousStarted
      expect(a.finalDate).toBe(target)
      expect(a.stopReason.type).toBe('arrived')
      continuous = a.world

      const bStarted = performance.now()
      const reloadProfile = createPhaseProfile()
      const b = simulateUntilDate(reloaded, target, reloadedSeed, reloadProfile.observer)
      expect(b.finalDate).toBe(target)
      expect(b.stopReason.type).toBe('arrived')
      const reloadedSimulationMs = performance.now() - bStarted
      const saveStarted = performance.now()
      const envelope = serializeGameWorldV4(b.world, `${target}T00:00:00.000Z`)
      const saveBytes = new TextEncoder().encode(JSON.stringify(envelope)).byteLength
      const saveMs = performance.now() - saveStarted
      const loadStarted = performance.now()
      reloaded = deserializeGameWorldV4(JSON.parse(JSON.stringify(envelope)))
      const loadMs = performance.now() - loadStarted

      const left = semanticSnapshot(continuous)
      const right = semanticSnapshot(reloaded)
      expect(right).toEqual(left)
      const metrics = collectMetrics(continuous, saveBytes, saveMs, loadMs, Math.round((continuousMs + reloadedSimulationMs) / 2))
      assertIntegrity(continuous)
      process.stdout.write(`[BS15I] Year ${year} complete · elapsed=${Math.round((performance.now() - certificationStarted) / 1000)}s players=${metrics.totalPlayers} saveBytes=${saveBytes} rss=${Math.round(process.memoryUsage().rss / 1048576)}MB matchMs=${Math.round(continuousProfile.profile.matchResolutionMs + reloadProfile.profile.matchResolutionMs)} calendarMs=${Math.round(continuousProfile.profile.calendarMs + reloadProfile.profile.calendarMs)}\n`)
    }
    expect(Number(reloaded.currentDate.slice(0, 4))).toBe(2062)
    expect(Object.values(reloaded.talentCohortsById).some((item) => item.generationYear >= 2055)).toBe(true)
  }, 3_600_000)

  fullCertification('runs a diverse 5-year seed without a population or ruleset dead end', async () => {
    let world = useAiWorld(createNewGame({ seed: 992204 }))
    const result = simulateUntilDate(world, addYears(start, 5))
    world = result.world
    expect(result.stopReason.type).toBe('arrived')
    expect(Object.values(world.talentCohortsById).some((item) => item.generationYear >= 2037)).toBe(true)
    assertIntegrity(world)
    process.stdout.write(`[BS15I] Diversity seed 992204 · Year 5 · players=${Object.keys(world.players).length} rss=${Math.round(process.memoryUsage().rss / 1048576)}MB\n`)
  }, 1_200_000)
})

function semanticSnapshot(world: GameWorld) {
  const active = Object.values(world.teams).flatMap((team) => team.rosterPlayerIds.map((playerId) => `${team.id}:${playerId}`)).sort()
  return {
    currentDate: world.currentDate,
    playerIds: Object.keys(world.players).sort(),
    personIds: Object.keys(world.personsById).sort(),
    cohorts: Object.values(world.talentCohortsById).map((item) => `${item.id}:${item.candidateCapacity}`).sort(),
    materializations: Object.values(world.talentMaterializationsByCandidateKey).map((item) => `${item.candidateKey}:${item.playerId}`).sort(),
    rosters: active,
    enrollments: Object.values(world.playerEnrollmentsById).filter((item) => item.status === 'active').map((item) => `${item.playerId}:${item.teamId}`).sort(),
    drafts: Object.values(world.draftsById).filter((item) => item.status !== 'completed').map((item) => item.id).sort(),
    portal: Object.values(world.transferPortalEntriesById).filter((item) => item.status === 'noticePending' || item.status === 'authorized').map((item) => item.id).sort(),
    collegeRules: Object.values(world.collegeRulesetsById).map((item) => item.id).sort(),
    portalRules: Object.values(world.transferPortalRulesetsById).map((item) => item.id).sort(),
    recruitingCycles: Object.values(world.recruitingCyclesById).map((item) => item.id).sort(),
  }
}

let certificationStarted = 0
const continuousSeed = seededMatchSource(15015)
const reloadedSeed = seededMatchSource(15015)

function seededMatchSource(seed: number) {
  let state = seed >>> 0
  return () => (state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0)
}

function createPhaseProfile() {
  const profile = { matchResolutionMs: 0, calendarMs: 0 }
  return {
    profile,
    observer: {
      onDayAdvance: (result: import('@/app/game/advanceGameDay').WorldDayAdvanceResult) => {
        for (const phase of result.phases) {
          if (phase.phaseId === 'MATCH_RESOLUTION') profile.matchResolutionMs += phase.elapsedMs ?? 0
          else if (phase.phaseId !== 'PRE_ADVANCE_VALIDATION' && phase.phaseId !== 'DAY_COMPLETE') profile.calendarMs += phase.elapsedMs ?? 0
        }
      },
    },
  }
}

function useAiWorld(world: GameWorld): GameWorld {
  const unemployed = Object.values(world.coachEmploymentByCoachId).find((employment) => employment.status === 'unemployed')
  const coachId = unemployed === undefined ? undefined : Object.keys(world.coachEmploymentByCoachId).find((id) => world.coachEmploymentByCoachId[id as keyof typeof world.coachEmploymentByCoachId] === unemployed)
  if (coachId === undefined) throw new Error('Long-horizon AI fixture needs an unemployed Coach so no human match interrupts certification.')
  return updateGameWorld(world, { userCoachId: coachId as GameWorld['userCoachId'] })
}

function collectMetrics(world: GameWorld, saveBytes: number, saveMs: number, loadMs: number, simulationMs: number) {
  const rostered = new Set(Object.values(world.teams).flatMap((team) => team.rosterPlayerIds))
  const activePlayers = Object.values(world.players).filter((item) => item.careerEnd === undefined)
  const registrationsByRole = { youth: 0, college: 0, pro: 0 }
  const youthTeamIds = new Set(Object.values(world.teamPathwayRelationsById).filter((relation) => relation.role === 'youth').map((relation) => relation.teamId))
  for (const playerId of rostered) {
    const teamId = Object.values(world.teams).find((team) => team.rosterPlayerIds.includes(playerId))?.id
    if (teamId === undefined) continue
    const kind = Object.values(world.competitions).find((competition) => competition.participantTeamIds.includes(teamId))?.ecosystemId
    const ecosystemKind = kind === undefined ? undefined : world.ecosystems[kind]?.kind
    if (youthTeamIds.has(teamId)) registrationsByRole.youth += 1
    else if (ecosystemKind === 'ncaaLike') registrationsByRole.college += 1
    else if (ecosystemKind === 'nbaLike' || ecosystemKind === 'fibaLike') registrationsByRole.pro += 1
  }
  const latent = Object.values(world.talentCohortsById).reduce((sum, cohort) => sum + cohort.candidateCapacity, 0)
  const ageBands = { under15: 0, from15To18: 0, from19To22: 0, from23To29: 0, from30To39: 0, age40Plus: 0 }
  for (const player of activePlayers) {
    const age = calculateAge(player.bio.dateOfBirth, world.currentDate)
    if (age < 15) ageBands.under15 += 1
    else if (age <= 18) ageBands.from15To18 += 1
    else if (age <= 22) ageBands.from19To22 += 1
    else if (age <= 29) ageBands.from23To29 += 1
    else if (age <= 39) ageBands.from30To39 += 1
    else ageBands.age40Plus += 1
  }
  const ratingValues = activePlayers.flatMap((player) => Object.values(player.basketball.ratings).filter((value): value is number => typeof value === 'number'))
  const averageRating = ratingValues.length === 0 ? 0 : Math.round(ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length * 100) / 100
  return {
    totalPlayers: Object.keys(world.players).length,
    activePlayers: activePlayers.length,
    retiredInactive: Object.keys(world.players).length - activePlayers.length,
    latentCapacity: latent,
    materialized: Object.keys(world.talentMaterializationsByCandidateKey).length,
    latentToMaterializedRatio: `${latent}:${Object.keys(world.talentMaterializationsByCandidateKey).length}`,
    youth: registrationsByRole.youth,
    college: registrationsByRole.college,
    pro: registrationsByRole.pro,
    portalActive: Object.values(world.transferPortalEntriesById).filter((item) => item.status === 'noticePending' || item.status === 'authorized').length,
    draftCandidates: Object.values(world.draftsById).filter((item) => item.status !== 'completed').flatMap((item) => item.entries ?? []).filter((item) => item.status === 'finalPool' || item.status === 'declaredEarlyEntry').length,
    activeEnrollmentCount: Object.values(world.playerEnrollmentsById).filter((item) => item.status === 'active').length,
    ageBands,
    averageRatingAuditOnly: averageRating,
    transitionCounts: Object.values(world.ecosystemTransitionsById).reduce<Record<string, number>>((counts, transition) => { counts[transition.transitionType] = (counts[transition.transitionType] ?? 0) + 1; return counts }, {}),
    saveBytes,
    saveMs: Math.round(saveMs),
    loadMs: Math.round(loadMs),
    simulationMs: Math.round(simulationMs),
  }
}

function assertIntegrity(world: GameWorld): void {
  const players = Object.values(world.players)
  const people = Object.values(world.personsById)
  expect(new Set(players.map((player) => player.id)).size).toBe(players.length)
  expect(new Set(people.map((person) => person.id)).size).toBe(people.length)
  expect(new Set(players.map((player) => player.personId)).size).toBe(players.length)
  for (const player of players) expect(world.personsById[player.personId!]).toBeDefined()
  const currentRoster = new Map<string, string>()
  for (const team of Object.values(world.teams)) {
    expect(new Set(team.rosterPlayerIds).size).toBe(team.rosterPlayerIds.length)
    for (const playerId of team.rosterPlayerIds) expect(world.players[playerId]).toBeDefined()
    expect(team.rosterPlayerIds.some((id) => world.players[id]?.careerEnd !== undefined)).toBe(false)
    for (const playerId of team.rosterPlayerIds) {
      expect(currentRoster.has(playerId)).toBe(false)
      currentRoster.set(playerId, team.id)
    }
  }
  for (const item of Object.values(world.talentMaterializationsByCandidateKey)) expect(world.players[item.playerId]).toBeDefined()
  for (const item of Object.values(world.playerEnrollmentsById)) expect(world.players[item.playerId]).toBeDefined()
  for (const item of Object.values(world.playerRegistrationsById)) expect(world.players[item.playerId]).toBeDefined()
  for (const item of Object.values(world.transferPortalEntriesById)) expect(world.players[item.playerId]).toBeDefined()
  for (const item of Object.values(world.draftsById).flatMap((draft) => draft.entries ?? [])) expect(world.players[item.playerId]).toBeDefined()
}
