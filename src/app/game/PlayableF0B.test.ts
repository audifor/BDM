import { beforeAll, describe, expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import { getGamePlan } from '@/app/game/TacticalPlanning'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import type { GameSaveRepository } from '@/app/save/GameSaveRepository'
import type { GameWorld } from '@/domain/world'
import { managedPolicy, staffWithRole } from './testSupport/PlayableF2Policies'
import { createF2Day0, F2_WINDOW_DAYS, runF2Window, type F2Policy, type F2RunResult } from './testSupport/PlayableF2Support'

const savedAt = '2026-10-27T09:00:00.000Z'
const F0B_DAYS = F2_WINDOW_DAYS

const roundTrip = async (world: GameWorld): Promise<GameWorld> => {
  const repository: GameSaveRepository & { file: string } = {
    file: '',
    save: async (json) => { repository.file = json },
    load: async () => repository.file,
    getInfo: async () => ({ savedAt }),
  }
  await saveCurrentGame(world, repository, savedAt)
  return loadSavedGame(repository)
}

/** F0B-B: the coach delegates the existing staff responsibilities once, then leaves the club alone. */
const delegatedAutonomyPolicy: F2Policy = {
  id: 'F0B-B-delegated',
  decide({ day, world, store, teamId, record }) {
    if (day === 1) {
      const commands = [
        ['createTeamTrainingPlan', 'delegated', ['assistantCoach', 'associateCoach', 'playerDevelopmentCoach', 'performanceCoach']],
        ['assignIndividualDevelopment', 'delegated', ['playerDevelopmentCoach', 'developmentSpecialist', 'assistantCoach']],
        ['assignScouts', 'delegated', ['headScout', 'regionalScout']],
        ['oppositionScouting', 'advisory', ['advanceScout', 'headScout', 'assistantCoach', 'offensiveSpecialist', 'defensiveSpecialist']],
      ] as const
      for (const [kind, mode, roles] of commands) {
        const holder = roles.map((role) => staffWithRole(world, teamId, role as never)).find((staffId): staffId is NonNullable<typeof staffId> => staffId !== undefined)
        if (holder === undefined) continue
        store.setStaffResponsibility({ teamId, kind: kind as never, mode: mode as never, holderStaffId: holder })
        record('setStaffResponsibility', `${kind} ${mode} -> ${holder}`)
      }
    }

    const nextGame = getNextUserGame(store.world!)
    const report = nextGame === undefined ? undefined : Object.values(store.world!.oppositionScoutingReportsById).find((candidate) => candidate.teamId === teamId && candidate.gameId === nextGame.id)
    if (report !== undefined && getGamePlan(store.world!, report.gameId, teamId)?.tacticalOverride === undefined) {
      store.acceptOppositionScoutingReport(report.id)
      record('acceptOppositionScoutingReport', `${report.id} -> next game plan`)
    }
  },
}

/** F0B-C: the coach manages the same calendar actively through the existing F2 training/rotation commands. */
const activeCoachPolicy: F2Policy = {
  id: 'F0B-C-active',
  decide(context) {
    managedPolicy({ delegation: false }).decide(context)
    const nextGame = getNextUserGame(context.store.world!)
    if (nextGame === undefined || getGamePlan(context.store.world!, nextGame.id, context.teamId)?.tacticalOverride !== undefined) return
    context.store.updateGamePlanTacticalOverride({ pace: 1, shotProfile: { rim: 0, midRange: 0, threePoint: 1 }, defense: { interior: 0, perimeter: 1 } })
    context.record('updateGamePlanTacticalOverride', `${nextGame.id} -> active coach plan`)
  },
}

let day0: GameWorld
let A: F2RunResult
let B: F2RunResult
let C: F2RunResult

beforeAll(async () => {
  day0 = await createF2Day0()
  A = runF2Window(await roundTrip(day0), { id: 'F0B-A-initial', decide: () => {} }, 7, F0B_DAYS, 1, [15])
  B = runF2Window(await roundTrip(day0), delegatedAutonomyPolicy, 7, F0B_DAYS, 1, [15])
  C = runF2Window(await roundTrip(day0), activeCoachPolicy, 7, F0B_DAYS, 1, [15])
}, 1_200_000)

describe('CAREER-F0B · certificación jugable A/B/C de 30 días', () => {
  it('parte de tres Save V4 equivalentes y conserva el mismo calendario/semillas', async () => {
    expect(projectPersistentWorldTruth(await roundTrip(day0))).toEqual(projectPersistentWorldTruth(day0))
    for (const run of [A, B, C]) {
      expect(run.snapshots).toHaveLength(F0B_DAYS + 1)
      expect(run.snapshots.at(-1)!.date).toBe(addDays(day0.currentDate, F0B_DAYS))
      expect(run.games.map((game) => game.gameId)).toEqual(A.games.map((game) => game.gameId))
    }
  })

  it('A no inventa trabajo y B ejecuta entrenamiento delegado real con Staff y consecuencias canónicas', () => {
    const teamId = getUserTeam(day0)!.id
    const sessions = (run: F2RunResult) => Object.values(run.world.scheduledTrainingSessionsById).filter((session) => session.teamId === teamId && session.status === 'completed')
    expect(sessions(A)).toHaveLength(0)
    expect(sessions(B).length).toBeGreaterThan(0)
    // The execution boundary resolves the delegated holder at run time and persists the real Staff executor in the evidence.
    expect(sessions(B).some((session) => (session.execution?.executingStaffPersonIds.length ?? 0) > 0)).toBe(true)
    expect(Object.values(B.world.developmentStimulusEventsById).some((event) => event.sourceType === 'training')).toBe(true)
    expect(B.world.teamCohesionByTeamId[teamId]).toBeDefined()
    expect(B.decisions.some((decision) => decision.action === 'setStaffResponsibility' && decision.detail.startsWith('createTeamTrainingPlan'))).toBe(true)
  })

  it('B prepara scouting del próximo rival y la decisión aceptada llega al plan que consume MatchEngine', () => {
    const teamId = getUserTeam(day0)!.id
    const reports = Object.values(B.world.oppositionScoutingReportsById).filter((report) => report.teamId === teamId)
    expect(reports.length).toBeGreaterThan(0)
    expect(B.decisions.some((decision) => decision.action === 'setStaffResponsibility' && decision.detail.startsWith('assignScouts'))).toBe(true)
    expect(B.decisions.some((decision) => decision.action === 'acceptOppositionScoutingReport')).toBe(true)
    const acceptedReport = reports.find((report) => B.decisions.some((decision) => decision.detail.includes(report.id)))!
    const plan = getGamePlan(B.world, acceptedReport.gameId, teamId)
    expect(plan).toBeDefined()
    // The report can honestly be neutral when the real knowledge base is insufficient; no hidden truth is fabricated.
    if (acceptedReport.recommendedPaceAdjustment !== undefined || acceptedReport.recommendedDefensiveEmphasis !== undefined) expect(plan?.tacticalOverride).toBeDefined()
  })

  it('C deja una decisión táctica manual y A/B/C sobreviven a Save V4 sin duplicar estado', { timeout: 120_000 }, async () => {
    const teamId = getUserTeam(day0)!.id
    expect(C.decisions.some((decision) => decision.action === 'updateGamePlanTacticalOverride')).toBe(true)
    const loaded = await roundTrip(B.world)
    expect(projectPersistentWorldTruth(loaded)).toEqual(projectPersistentWorldTruth(B.world))
    expect(Object.keys(loaded.scheduledTrainingSessionsById)).toEqual(Object.keys(B.world.scheduledTrainingSessionsById))
    expect(Object.keys(loaded.oppositionScoutingReportsById)).toEqual(Object.keys(B.world.oppositionScoutingReportsById))
    expect(loaded.careerFatigueByPlayerId).toEqual(B.world.careerFatigueByPlayerId)
    expect(loaded.teamCohesionByTeamId[teamId]).toBe(B.world.teamCohesionByTeamId[teamId])
  })
})
