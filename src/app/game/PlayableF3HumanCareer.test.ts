import { beforeAll, describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { acceptCoachJobOffer, applyUserCoachForJob } from '@/app/coachCareer'
import { addDays } from '@/domain/date'
import { relationshipKey } from '@/domain/relationships'
import { getUserTeam } from '@/engine/calendar'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { getUserHumanSituations } from '@/app/hrpg/HumanSimulationService'
import { createF2Day0, runF2Window, type F2Policy, type F2RunResult } from './testSupport/PlayableF2Support'
import { automaticPolicy, managedPolicy } from './testSupport/PlayableF2Policies'
import type { GameWorld } from '@/domain/world'

const DAYS = 30
const SALT = 37

function humanChoicePolicy(base: F2Policy, choice: 'seekInput' | 'setDirection'): F2Policy {
  return {
    id: `${base.id}-${choice}`,
    decide(context) {
      if (context.day === 1) {
        const meeting = getUserHumanSituations(context.world).find((item) => item.status === 'open' && item.choices.some((action) => action.id === choice))
        if (meeting !== undefined) {
          const result = context.store.decideUserHumanSituation(meeting.id, choice)
          context.record('decideUserHumanSituation', `${meeting.id} -> ${choice} (${result.status})`)
        }
      }
      base.decide(context)
    },
  }
}

let day0: GameWorld
let A: F2RunResult
let B: F2RunResult
let C: F2RunResult
let assistantId: string

beforeAll(async () => {
  day0 = await createF2Day0()
  const teamId = getUserTeam(day0)!.id
  assistantId = Object.values(day0.teamStaffAssignmentsById).find((assignment) => assignment.teamId === teamId && assignment.role === 'assistantCoach')?.staffPersonId ?? ''
  A = runF2Window(day0, automaticPolicy, SALT, DAYS, 1, [15])
  B = runF2Window(day0, humanChoicePolicy(managedPolicy(), 'seekInput'), SALT, DAYS, 1, [15])
  C = runF2Window(day0, humanChoicePolicy(managedPolicy({ delegation: false }), 'setDirection'), SALT, DAYS, 1, [15])
}, 1_200_000)

describe('CAREER-F3 human career: A/B/C/D reproducible acceptance', () => {
  it('runs the same 30-day sport calendar with human choices recorded in B and C', () => {
    expect(A.world.currentDate).toBe(addDays(day0.currentDate, DAYS))
    expect(B.world.currentDate).toBe(A.world.currentDate)
    expect(C.world.currentDate).toBe(A.world.currentDate)
    expect(A.games.map((game) => game.gameId)).toEqual(B.games.map((game) => game.gameId))
    expect(B.games.map((game) => game.gameId)).toEqual(C.games.map((game) => game.gameId))
    expect(B.decisions.some((decision) => decision.action === 'decideUserHumanSituation' && decision.detail.includes('seekInput'))).toBe(true)
    expect(C.decisions.some((decision) => decision.action === 'decideUserHumanSituation' && decision.detail.includes('setDirection'))).toBe(true)
    expect(A.decisions.some((decision) => decision.action === 'decideUserHumanSituation')).toBe(false)
    expect(B.games.length).toBeGreaterThan(0)
  })

  it('keeps human consequences causal and separate from sporting attribution', () => {
    expect(assistantId).not.toBe('')
    const coachId = day0.userCoachId
    const memories = (world: GameWorld) => Object.values(world.memoriesById).filter((memory) => memory.tags.includes('meeting'))
    expect(memories(A.world)).toHaveLength(0)
    expect(memories(B.world).length).toBeGreaterThan(0)
    expect(memories(C.world).length).toBeGreaterThan(0)
    expect(B.world.relationshipsByKey[relationshipKey(assistantId, coachId)]).toBeDefined()
    expect(C.world.relationshipsByKey[relationshipKey(assistantId, coachId)]).toBeDefined()
    // The existing rules create human memory/relationship consequences; they do not
    // add a universal trust multiplier to MatchEngine, so equal fixtures remain equal.
    expect(B.games.map((game) => `${game.gameId}:${game.pointsFor}-${game.pointsAgainst}`)).toEqual(
      C.games.map((game) => `${game.gameId}:${game.pointsFor}-${game.pointsAgainst}`),
    )
  })

  it('D preserves identity, career memory and the new club through a valid Save V4 club change', () => {
    const base = createNewGame()
    const oldTeam = getUserTeam(base)!
    const opening = Object.values(base.coachJobOpeningsById).find((item) => item.status === 'open' && item.teamId !== oldTeam.id)!
    const applied = applyUserCoachForJob(base, opening.id)
    const offer = Object.values(applied.world.coachJobOffersById).find((item) => item.coachId === base.userCoachId && item.status === 'pending')!
    const moved = acceptCoachJobOffer(applied.world, offer.id)
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(moved, '2026-11-01T10:00:00.000Z'))

    expect(loaded.userCoachId).toBe(base.userCoachId)
    expect(loaded.coaches[base.userCoachId]!.personId).toBe(base.coaches[base.userCoachId]!.personId)
    expect(loaded.coachEmploymentByCoachId[base.userCoachId]?.teamId).toBe(opening.teamId)
    expect(loaded.teams[oldTeam.id]?.coachId).not.toBe(base.userCoachId)
    expect(Object.keys(loaded.memoriesById).length).toBe(Object.keys(moved.memoriesById).length)
  })
})
