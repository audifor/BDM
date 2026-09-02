import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { getUserTeam } from '@/engine/calendar'
import { getResponsibility, getTeamStaffAssignments, updateGameWorld, type GameWorld } from '@/domain/world'
import { responsibilityIdForTeam } from '@/domain/responsibility'
import { teamIdFromString, type StaffPersonId, type TeamId } from '@/domain/ids'
import type { StaffRoleId } from '@/domain/staff'

import { setTeamResponsibility } from './StaffResponsibilityService'

function world(): GameWorld {
  return createNewGame()
}

function userTeamId(w: GameWorld): TeamId {
  const team = getUserTeam(w)
  if (team === undefined) throw new Error('Expected a user team in the fixture world')
  return team.id
}

function staffWithRole(w: GameWorld, teamId: TeamId, role: StaffRoleId): StaffPersonId {
  const assignment = getTeamStaffAssignments(w, teamId).find((item) => item.role === role)
  if (assignment === undefined) throw new Error(`Expected an assignment with role ${role} on team ${teamId}`)
  return assignment.staffPersonId
}

describe('setTeamResponsibility', () => {
  it('userControlled removes any existing holder', () => {
    const w = world()
    const teamId = userTeamId(w)
    const scoutId = staffWithRole(w, teamId, 'regionalScout')
    const delegated = setTeamResponsibility(w, { teamId, kind: 'oppositionReport', mode: 'advisory', holderStaffId: scoutId })
    const reverted = setTeamResponsibility(delegated, { teamId, kind: 'oppositionReport', mode: 'userControlled' })
    const responsibility = getResponsibility(reverted, teamId, 'oppositionReport')
    expect(responsibility?.mode).toBe('userControlled')
    expect(responsibility?.holderStaffId).toBeUndefined()
  })

  it('organizational removes any existing holder and never fabricates a Staff holder', () => {
    const w = world()
    const teamId = userTeamId(w)
    const scoutId = staffWithRole(w, teamId, 'regionalScout')
    const delegated = setTeamResponsibility(w, { teamId, kind: 'oppositionReport', mode: 'advisory', holderStaffId: scoutId })
    const organizational = setTeamResponsibility(delegated, { teamId, kind: 'oppositionReport', mode: 'organizational' })
    const responsibility = getResponsibility(organizational, teamId, 'oppositionReport')
    expect(responsibility?.mode).toBe('organizational')
    expect(responsibility?.holderStaffId).toBeUndefined()
  })

  it('delegated with a valid eligible holder assigns the holder', () => {
    const w = world()
    const teamId = userTeamId(w)
    const assistantId = staffWithRole(w, teamId, 'assistantCoach')
    const updated = setTeamResponsibility(w, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: assistantId })
    const responsibility = getResponsibility(updated, teamId, 'createTeamTrainingPlan')
    expect(responsibility?.mode).toBe('delegated')
    expect(responsibility?.holderStaffId).toBe(assistantId)
  })

  it('advisory with a valid eligible holder assigns the holder', () => {
    const w = world()
    const teamId = userTeamId(w)
    const medicalId = staffWithRole(w, teamId, 'physiotherapist')
    const updated = setTeamResponsibility(w, { teamId, kind: 'treatmentRecommendation', mode: 'advisory', holderStaffId: medicalId })
    const responsibility = getResponsibility(updated, teamId, 'treatmentRecommendation')
    expect(responsibility?.mode).toBe('advisory')
    expect(responsibility?.holderStaffId).toBe(medicalId)
  })

  it('delegated without a holder is rejected', () => {
    const w = world()
    const teamId = userTeamId(w)
    expect(() => setTeamResponsibility(w, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated' })).toThrow()
  })

  it('advisory without a holder is rejected', () => {
    const w = world()
    const teamId = userTeamId(w)
    expect(() => setTeamResponsibility(w, { teamId, kind: 'treatmentRecommendation', mode: 'advisory' })).toThrow()
  })

  it('a Staff member from another Team is rejected', () => {
    const w = world()
    const teamId = userTeamId(w)
    const otherTeamId = Object.keys(w.teams).map((id) => teamIdFromString(id)).find((id) => id !== teamId)
    if (otherTeamId === undefined) throw new Error('Expected at least two teams in the fixture world')
    const otherAssistantId = staffWithRole(w, otherTeamId, 'assistantCoach')
    expect(() => setTeamResponsibility(w, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: otherAssistantId })).toThrow()
  })

  it('a Staff member whose role is not eligible for the responsibility is rejected', () => {
    const w = world()
    const teamId = userTeamId(w)
    const medicalId = staffWithRole(w, teamId, 'physiotherapist')
    expect(() => setTeamResponsibility(w, { teamId, kind: 'assignScouts', mode: 'delegated', holderStaffId: medicalId })).toThrow()
  })

  it('an unsupported mode is rejected', () => {
    const w = world()
    const teamId = userTeamId(w)
    const scoutId = staffWithRole(w, teamId, 'regionalScout')
    // oppositionScouting does not support 'delegated' per RESPONSIBILITY_REGISTRY
    expect(() => setTeamResponsibility(w, { teamId, kind: 'oppositionScouting', mode: 'delegated', holderStaffId: scoutId })).toThrow()
  })

  it('coach-only responsibilities never accept a Staff holder', () => {
    const w = world()
    const teamId = userTeamId(w)
    const assistantId = staffWithRole(w, teamId, 'assistantCoach')
    expect(() => setTeamResponsibility(w, { teamId, kind: 'rotationPlanning', mode: 'delegated', holderStaffId: assistantId })).toThrow()
  })

  it('uses the canonical responsibilityIdForTeam id', () => {
    const w = world()
    const teamId = userTeamId(w)
    const assistantId = staffWithRole(w, teamId, 'assistantCoach')
    const updated = setTeamResponsibility(w, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: assistantId })
    expect(updated.responsibilitiesById[responsibilityIdForTeam(teamId, 'createTeamTrainingPlan')]).toBeDefined()
  })

  it('never duplicates a Responsibility row for the same (team, kind)', () => {
    const w = world()
    const teamId = userTeamId(w)
    const assistantId = staffWithRole(w, teamId, 'assistantCoach')
    const first = setTeamResponsibility(w, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: assistantId })
    const second = setTeamResponsibility(first, { teamId, kind: 'createTeamTrainingPlan', mode: 'userControlled' })
    const rows = Object.values(second.responsibilitiesById).filter((item) => item.teamId === teamId && item.kind === 'createTeamTrainingPlan')
    expect(rows).toHaveLength(1)
  })

  it('sets assignedOn to the world current date when a holder exists, and clears it when not', () => {
    const w = world()
    const teamId = userTeamId(w)
    const assistantId = staffWithRole(w, teamId, 'assistantCoach')
    const delegated = setTeamResponsibility(w, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: assistantId })
    expect(getResponsibility(delegated, teamId, 'createTeamTrainingPlan')?.assignedOn).toBe(w.currentDate)
    const reverted = setTeamResponsibility(delegated, { teamId, kind: 'createTeamTrainingPlan', mode: 'userControlled' })
    expect(getResponsibility(reverted, teamId, 'createTeamTrainingPlan')?.assignedOn).toBeUndefined()
  })

  it('preserves unrelated GameWorld state', () => {
    const w = world()
    const teamId = userTeamId(w)
    const assistantId = staffWithRole(w, teamId, 'assistantCoach')
    const updated = setTeamResponsibility(w, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: assistantId })
    expect(updated.staffPeopleById).toEqual(w.staffPeopleById)
    expect(updated.teamStaffAssignmentsById).toEqual(w.teamStaffAssignmentsById)
    expect(updated.teams).toEqual(w.teams)
    expect(updated.players).toEqual(w.players)
    expect(updated.currentDate).toEqual(w.currentDate)
  })

  it('rejects an unknown Team id', () => {
    const w = world()
    expect(() => setTeamResponsibility(w, { teamId: 'not-a-real-team' as TeamId, kind: 'createTeamTrainingPlan', mode: 'userControlled' })).toThrow()
  })

  it('rejects the assignment via the Application boundary even if a caller bypasses UI validation (defense in depth)', () => {
    const w = world()
    const teamId = userTeamId(w)
    const scoutId = staffWithRole(w, teamId, 'regionalScout')
    // matchupRecommendation supports advisory but not delegated
    expect(() => setTeamResponsibility(w, { teamId, kind: 'matchupRecommendation', mode: 'delegated', holderStaffId: scoutId })).toThrow()
    expect(() => updateGameWorld(w, { responsibilities: [{ id: responsibilityIdForTeam(teamId, 'matchupRecommendation'), teamId, kind: 'matchupRecommendation', mode: 'delegated', holderStaffId: scoutId }] })).toThrow()
  })
})
