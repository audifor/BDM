import { beforeAll, describe, expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { getActivePlayerContract, updateGameWorld } from '@/domain/world'
import { createNewGame } from '@/app/game'
import { advanceGameDayWithResult } from '@/app/game/advanceGameDay'
import { releasePlayer } from '@/app/market'
import { assessGMDecisionContext } from '@/engine/gmDecisionContext'
import { initializeAiClubManagementPlanning, reviewClubManagementPlanning, reviewMajorInjuryChanges, reviewMaterialRosterChanges } from './GMPlanningLifecycleService'

describe('GM planning lifecycle coordinator', () => {
  let initialWorld: ReturnType<typeof createNewGame>
  beforeAll(() => { initialWorld = createNewGame() }, 120_000)

  it('initializes AI plans after career setup and safely repeats an unchanged initial checkpoint', () => {
    const world = initialWorld
    const aiTeams = Object.values(world.teams).filter((team) => team.coachId !== undefined && team.coachId !== world.userCoachId)
    expect(aiTeams.every((team) => world.clubStrategicStatesByTeamId[team.id] !== undefined)).toBe(true)
    expect(Object.values(world.gmPlanStatesById).some((plan) => plan.teamId === Object.values(world.teams).find((team) => team.coachId === world.userCoachId)?.id)).toBe(false)

    const eligibleTeam = aiTeams[0]!
    const eligibleWorld = updateGameWorld(world, { teams: Object.values(world.teams).map((team) => team.id === eligibleTeam.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.slice(0, 4) } : team) })
    const initialized = initializeAiClubManagementPlanning(eligibleWorld)
    expect(Object.values(initialized.gmPlanStatesById).some((plan) => plan.teamId === eligibleTeam.id)).toBe(true)
    const repeated = initializeAiClubManagementPlanning(initialized)
    expect(repeated.gmPlanStatesById).toEqual(initialized.gmPlanStatesById)
    expect(repeated.clubStrategicStatesByTeamId).toEqual(initialized.clubStrategicStatesByTeamId)
    expect(reviewMaterialRosterChanges(world, world)).toBe(world)
  })

  it('reviews only the club changed by a completed market roster action', () => {
    const world = initialWorld
    const nextDate = addDays(world.currentDate, 1)
    const shifted = updateGameWorld(world, { currentDate: nextDate })
    const changedTeam = Object.values(shifted.teams).filter((team) => team.coachId !== undefined && team.coachId !== shifted.userCoachId && team.rosterPlayerIds.length > 6).find((team) => team.rosterPlayerIds.some((playerId) => getActivePlayerContract(shifted, playerId) !== undefined))!
    const untouchedTeam = Object.values(shifted.teams).find((team) => team.coachId !== undefined && team.coachId !== shifted.userCoachId && team.id !== changedTeam.id)!
    const unrelatedStrategy = shifted.clubStrategicStatesByTeamId[untouchedTeam.id]
    const releasedPlayerId = changedTeam.rosterPlayerIds.find((playerId) => getActivePlayerContract(shifted, playerId) !== undefined)!
    const changed = releasePlayer(shifted, changedTeam.id, releasedPlayerId)

    expect(changed.teams[changedTeam.id]!.rosterPlayerIds).not.toContain(releasedPlayerId)
    expect(changed.clubStrategicStatesByTeamId[changedTeam.id]!.lastReviewedOn).toBe(nextDate)
    expect(changed.clubStrategicStatesByTeamId[untouchedTeam.id]).toEqual(unrelatedStrategy)
  })

  it('keeps user-club recommendations advisory and does not persist plans', () => {
    const world = initialWorld
    const userTeam = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!
    const result = reviewClubManagementPlanning(world, userTeam.id, 'EXPLICIT_REVIEW')

    expect(result.kind).toBe('USER_RECOMMENDED_WORKFLOW')
    expect(result.world).toBe(world)
    expect(Object.values(result.world.gmPlanStatesById).some((plan) => plan.teamId === userTeam.id)).toBe(false)
  })

  it('rechecks an AI club after new serious injuries using the canonical serious severity', () => {
    const world = initialWorld
    const team = Object.values(world.teams).filter((candidate) => candidate.coachId !== undefined && candidate.coachId !== world.userCoachId).sort((left, right) => left.id.localeCompare(right.id))[0]!
    const shortRoster = updateGameWorld(world, { teams: Object.values(world.teams).map((candidate) => candidate.id === team.id ? { ...candidate, rosterPlayerIds: candidate.rosterPlayerIds.slice(0, 6) } : candidate) })
    const injuries = shortRoster.teams[team.id]!.rosterPlayerIds.slice(0, 2).map((playerId, index) => createInjury({
      id: injuryIdFromString(`gm-planning-serious-injury-${index}`), playerId, kind: 'kneeSprain', severity: 'serious',
      injuredOn: shortRoster.currentDate, expectedReturnDate: addDays(shortRoster.currentDate, 30),
    }))
    const withInjuries = updateGameWorld(shortRoster, { injuries: [...Object.values(shortRoster.injuriesById), ...injuries] })
    const reviewed = reviewMajorInjuryChanges(shortRoster, withInjuries)

    const assessment = assessGMDecisionContext(reviewed, team.id).needsAssessment
    const coverNeed = assessment.needs.find((need) => need.kind === 'TEMPORARY_COVER')
    expect(coverNeed).toBeDefined()
    expect(Object.values(reviewed.gmPlanStatesById).some((plan) => plan.teamId === team.id && plan.needId === coverNeed!.id)).toBe(true)

    const moderate = createInjury({
      id: injuryIdFromString('gm-planning-moderate-injury'), playerId: shortRoster.teams[team.id]!.rosterPlayerIds[2]!, kind: 'ankleSprain', severity: 'moderate',
      injuredOn: shortRoster.currentDate, expectedReturnDate: addDays(shortRoster.currentDate, 14),
    })
    const withModerateInjury = updateGameWorld(shortRoster, { injuries: [...Object.values(shortRoster.injuriesById), moderate] })
    expect(reviewMajorInjuryChanges(shortRoster, withModerateInjury)).toBe(withModerateInjury)
  })

  it('does not churn plans during an ordinary day with no material roster change', () => {
    const world = initialWorld
    const result = advanceGameDayWithResult(world)

    expect(result.status).not.toBe('FAILED')
    expect(result.world.gmPlanStatesById).toEqual(world.gmPlanStatesById)
    expect(result.world.negotiationsById).toBe(world.negotiationsById)
    expect(result.phases.some((phase) => phase.phaseId === 'GM_PLANNING_CHECKPOINT')).toBe(false)
  })
})
