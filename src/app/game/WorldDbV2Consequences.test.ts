import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import { getTeamRoster, getTeamStaffPayroll, isPlayerAvailable, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { getCashAccountBalances, getFinancialHealthSnapshot } from '@/domain/finance'
import { loadSavedGame } from '@/app/save/GameSaveService'
import { serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { useGameStore } from '@/stores/gameStore'
import { advanceGameDayWithResultAsync } from './advanceGameDay'
import { evaluateSimulationBreakpoints } from './SimulationBreakpoints'
import { createUniverseAcceptanceRunner } from './testSupport/WorldDbV2UniverseRunner'
import { isoWeekday, managedPolicy, overloadPolicy } from './testSupport/PlayableF2Policies'
import { teamSnapshot, type F2DayContext } from './testSupport/PlayableF2Support'
import { acceptStaffJobOffer, completeStaffInterview, createStaffJobOffer, createStaffJobOpeningForTeam, identifyStaffCandidate, listFreeAgentStaff, rankStaffCandidates, startStaffInterview } from '@/app/staffCareer'

const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => [k, canonical(value)])) : v
const hash = (world: GameWorld) => {
  const payload = structuredClone(serializeGameWorldV4(world, '2026-10-27T12:00:00Z').payload)
  ;(payload.staffCareerRuntime.governanceDecisionEvents as { id: string }[]).sort((a, b) => a.id.localeCompare(b.id))
  return createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex')
}

it.skipIf(process.env.BDM_V206_CONSEQUENCES !== '1')('certifies automatic planning, reasonable coaching and harmful workload in the same four-league universe', async () => {
  const out = resolve('.worlddb-v2/v2-06/consequences'); mkdirSync(out, { recursive: true })
  const opening = readFileSync('.worlddb-v2/v2-06/opening.json', 'utf8')
  const repository = { save: async (_json: string) => {}, load: async () => opening, getInfo: async () => ({ savedAt: '2026-10-27T12:00:00Z' }) }
  const reports = [], initialHashes = []
  for (const arm of ['A', 'B', 'C'] as const) {
    let world = await loadSavedGame(repository)
    useGameStore.getState().replaceWorld(world); world = useGameStore.getState().world!
    const teamId = getUserTeam(world)!.id, runner = createUniverseAcceptanceRunner()
    initialHashes.push(hash(world))
    const decisions: { day: number; date: string; action: string; detail: string }[] = [], snapshots = []
    const policy = managedPolicy({ delegation: false, training: arm === 'B', weakLineup: arm === 'C' })
    const snapshot = (day: number) => ({ ...teamSnapshot(world, teamId, day), finances: world.teamFinancesByTeamId[teamId],
      cash: getCashAccountBalances(world, world.teams[teamId]!.organizationId, world.currentDate),
      financialHealth: getFinancialHealthSnapshot(world, world.teams[teamId]!.organizationId, world.currentDate, '2025-10-04'),
      staffPayroll: getTeamStaffPayroll(world, teamId),
      delegatedPlans: Object.values(world.delegationOutcomesById).filter(o => world.responsibilitiesById[o.responsibilityId]?.teamId === teamId && o.kind === 'createTeamTrainingPlan'),
      injuries: Object.values(world.injuriesById).filter(i => getTeamRoster(world, teamId).some(p => p.id === i.playerId)),
      unavailable: getTeamRoster(world, teamId).filter(p => !isPlayerAvailable(world, p.id, world.currentDate)).map(p => p.id),
      userGames: Object.values(world.games).filter(g => g.status === 'completed' && (g.homeTeamId === teamId || g.awayTeamId === teamId)).map(g => ({ id: g.id, result: g.result, acta: world.matchStatLogsByGameId[g.id] })) })
    snapshots.push(snapshot(0))
    try {
      for (let day = 1; day <= 14; day++) {
        useGameStore.getState().replaceWorld(world)
        const store = useGameStore.getState(), date = world.currentDate
        const context: F2DayContext = { day, date, world, store, teamId, record: (action, detail) => decisions.push({ day, date, action, detail }) }
        if (arm === 'A' && day === 2) {
          // The real market already contains the club's former coach. Hire through the same opening/interview/offer transaction as Courtside.
          const opening = createStaffJobOpeningForTeam(world, { teamId, roleId: 'assistantCoach' })
          const eligible = rankStaffCandidates(opening.world, opening.opening.id)
          const staffId = listFreeAgentStaff(opening.world).find(id => eligible.includes(id))
          expect(staffId, 'Existing eligible unemployed staff, never a fabricated assistant').toBeDefined()
          const candidate = identifyStaffCandidate(opening.world, { openingId: opening.opening.id, staffId: staffId! })
          const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
          const offer = createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId })
          store.replaceWorld(acceptStaffJobOffer(offer.world, offer.offerId))
          store.setStaffResponsibility({ teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: staffId! })
          context.record('hireAndDelegate', `Existing ${staffId}; canonical financed assistant contract; createTeamTrainingPlan delegated`)
        }
        if (arm === 'A' && isoWeekday(date) === 7) {
          store.scheduleAutomaticTeamTrainingWeek(addDays(date, 1))
          context.record('scheduleAutomaticTeamTrainingWeek', 'Existing one-click calendar/load planner; the hired assistant owns the training plan')
        } else if (arm !== 'A') {
          policy.decide(context)
          if (arm === 'C') overloadPolicy.decide({ ...context, world: useGameStore.getState().world! })
        }
        world = useGameStore.getState().world!
        for (const breakpoint of evaluateSimulationBreakpoints(world).candidates.filter(b => b.level === 'ACTION_REQUIRED' || b.level === 'BLOCKING')) {
          if (breakpoint.reason === 'userGame') continue
          const current = useGameStore.getState()
          if (breakpoint.reason === 'mediaOpportunity') current.skipMedia(breakpoint.sourceId)
          else if (breakpoint.reason === 'coachJobOffer') current.declineUserCoachOffer(breakpoint.sourceId)
          else if (breakpoint.reason === 'returnToPlayReview') current.reviewReturnToPlay(breakpoint.sourceId as never, 'CONTINUE_RECOVERY')
          else throw Error('Unresolved canonical stop: ' + JSON.stringify(breakpoint))
          decisions.push({ day, date, action: breakpoint.reason, detail: breakpoint.sourceId })
        }
        world = useGameStore.getState().world!
        let seed = 151617 + day * 100
        const result = await advanceGameDayWithResultAsync(world, runner, () => seed++)
        expect(result.status, JSON.stringify(result.failure ?? result.breakpointBefore.breakpoint)).toMatch(/COMPLETED|BREAKPOINT_AFTER_PROCESSING/)
        world = result.world; snapshots.push(snapshot(day))
      }
      const saved = JSON.stringify(serializeGameWorldV4(world, '2026-10-27T12:00:00Z'))
      const restored = await loadSavedGame({ ...repository, load: async () => saved })
      expect(hash(restored)).toBe(hash(world))
      expect(Object.keys(world.teams)).toHaveLength(70); expect(Object.keys(world.competitions)).toHaveLength(4)
      expect(snapshots.at(-1)!.userGames).toHaveLength(2)
      writeFileSync(resolve(out, arm + '-save.json'), saved)
      reports.push({ arm, initialHash: initialHashes.at(-1), finalHash: hash(world), decisions, snapshots, exactSaveRoundTrip: true })
      writeFileSync(resolve(out, 'comparison.json'), JSON.stringify({ reports, limitation: 'A hires an existing unemployed staff member through the canonical financed market, delegates the training plan and uses the existing automatic week planner. No automatic user rotation delegation is claimed. Two games per arm demonstrate consequences, not competitive superiority.' }, null, 2))
    } finally { runner.dispose() }
  }
  expect(new Set(initialHashes).size).toBe(1)
  // Choosing an arm confers no bonus: before any different command, exact actas are equal.
  expect(reports[1]!.snapshots[1]!.userGames).toEqual(reports[0]!.snapshots[1]!.userGames)
  expect(reports[2]!.snapshots[1]!.userGames).toEqual(reports[0]!.snapshots[1]!.userGames)
  const final = reports.map(r => r.snapshots.at(-1)!)
  expect(final[2]!.avgFatigue).toBeGreaterThan(final[1]!.avgFatigue)
  expect(final[0]!.completedSessions).toBeGreaterThan(0)
  expect(final[0]!.delegatedPlans.length).toBeGreaterThan(0)
  expect(new Set(reports.map(r => r.finalHash)).size).toBe(3)
}, 900_000)
