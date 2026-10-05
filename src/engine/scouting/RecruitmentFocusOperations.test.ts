import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { advanceGameDayWithResult } from '@/app/game/advanceGameDay'
import { cancelRecruitmentFocus, createRecruitmentFocus, getAddressableScoutingPlayerIds, getAvailableScoutingEvaluators, getRecruitmentFocusCandidates, requestPlayerScouting, searchAddressableScoutingPlayers } from '@/app/scouting'
import { addDays } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { progressRecruitmentFocuses, progressScoutingTerritoryAssignments } from '@/engine/scouting'

describe('Recruitment Focus operations', () => {
  it('discovers only matching Players over time and preserves discovery after cancellation', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const game = Object.values(base.games).find((item) => item.homeTeamId === team.id || item.awayTeamId === team.id)!
    const scout = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.role === 'regionalScout')!
    const position = 'PG' as const
    const input = { name: 'Young point guards', positions: [position], minimumAge: 18, maximumAge: 24, knowledgeState: 'DISCOVERED' as const, territories: [{ kind: 'COMPETITION' as const, competitionId: game.competitionId }], scoutStaffIds: [scout.staffPersonId], priority: 'HIGH' as const, duration: 'SHORT' as const }
    const created = createRecruitmentFocus(base, team.id, input)
    const focus = Object.values(created.scoutingRecruitmentFocusesById)[0]!
    expect(Object.values(created.scoutingTerritoryAssignmentsById).some((item) => item.recruitmentFocusId === focus.id && item.priority === 'HIGH')).toBe(true)
    const discovered = progressScoutingTerritoryAssignments(created)
    const candidates = getRecruitmentFocusCandidates(discovered, focus.id)
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((candidate) => candidate.position === 'PG' && candidate.age >= 18 && candidate.age <= 24 && candidate.knowledge === 'DISCOVERED')).toBe(true)
    const evaluator = getAvailableScoutingEvaluators(discovered, team.id, 'FULL_REPORT')[0]!
    const requested = requestPlayerScouting(discovered, { teamId: team.id, playerId: candidates[0]!.playerId, missionType: 'FULL_REPORT', evaluatorStaffId: evaluator })
    expect(getRecruitmentFocusCandidates(requested, focus.id).find((candidate) => candidate.playerId === candidates[0]!.playerId)).toMatchObject({ scoutingStatus: 'IN_PROGRESS', activeMission: 'FULL_REPORT' })
    const cancelled = cancelRecruitmentFocus(requested, focus.id)
    expect(cancelled.scoutingRecruitmentFocusesById[focus.id]?.status).toBe('CANCELLED')
    expect(Object.values(cancelled.scoutingTerritoryAssignmentsById).filter((item) => item.recruitmentFocusId === focus.id).every((item) => item.status === 'ENDED')).toBe(true)
    expect(Object.keys(cancelled.organizationPlayerAwarenessById)).toHaveLength(Object.keys(discovered.organizationPlayerAwarenessById).length)
  })

  it('closes bounded focuses after their duration and searches only addressable identities', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const game = Object.values(base.games).find((item) => item.homeTeamId === team.id || item.awayTeamId === team.id)!
    const scout = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.role === 'regionalScout')!
    const created = createRecruitmentFocus(base, team.id, { name: 'Guards', positions: ['PG', 'SG'], territories: [{ kind: 'COMPETITION', competitionId: game.competitionId }], scoutStaffIds: [scout.staffPersonId], priority: 'NORMAL', duration: 'SHORT' })
    let progressed = created
    for (let day = 0; day < 14; day += 1) { progressed = updateGameWorld(progressed, { currentDate: addDays(progressed.currentDate, 1) }); progressed = progressScoutingTerritoryAssignments(progressed); progressed = progressRecruitmentFocuses(progressed) }
    const focus = Object.values(progressed.scoutingRecruitmentFocusesById)[0]!
    expect(focus.status).toBe('COMPLETED')
    expect(focus.daysActive).toBe(14)
    const results = searchAddressableScoutingPlayers(base, team.id, { position: 'PG' })
    expect(results.every((id) => base.players[id] !== undefined)).toBe(true)
    expect(results.every((id) => getAddressableScoutingPlayerIds(base, team.id).includes(id))).toBe(true)
  })

  it('advances the full calendar lifecycle with an active Recruitment Focus', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const game = Object.values(base.games).find((item) => item.homeTeamId === team.id || item.awayTeamId === team.id)!
    const scout = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.role === 'regionalScout')!
    const focused = createRecruitmentFocus(base, team.id, { name: 'Calendar regression focus', positions: ['PG'], territories: [{ kind: 'COMPETITION', competitionId: game.competitionId }], scoutStaffIds: [scout.staffPersonId], priority: 'HIGH', duration: 'MEDIUM' })

    const result = advanceGameDayWithResult(focused)

    expect(result.status, result.failure?.message).not.toBe('FAILED')
    expect(result.world.currentDate).toBe(addDays(focused.currentDate, 1))
    expect(Object.values(result.world.scoutingRecruitmentFocusesById)[0]?.daysActive).toBe(1)
  })

  it('advances the simulation date and Recruitment Focus through the normal day command', async () => {
    const { advanceGameDayWithResult } = await import('@/app/game/advanceGameDay')
    const base = createNewGame()
    const team = getUserTeam(base)!
    const game = Object.values(base.games).find((item) => item.homeTeamId === team.id || item.awayTeamId === team.id)!
    const scout = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.role === 'regionalScout')!
    const created = createRecruitmentFocus(base, team.id, { name: 'Test focus', positions: ['PG'], territories: [{ kind: 'COMPETITION', competitionId: game.competitionId }], scoutStaffIds: [scout.staffPersonId], priority: 'HIGH', duration: 'MEDIUM' })
    const focusId = Object.keys(created.scoutingRecruitmentFocusesById)[0]!
    const result = advanceGameDayWithResult(created)
    expect(['COMPLETED', 'BREAKPOINT_AFTER_PROCESSING']).toContain(result.status)
    expect(result.world.currentDate).toBe(addDays(created.currentDate, 1))
    expect(result.world.scoutingRecruitmentFocusesById[focusId]?.daysActive).toBe(1)
  })
})
