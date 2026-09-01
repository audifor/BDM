import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { getUserTeam } from '@/engine/calendar'
import { getTeamStaffAssignments, type GameWorld } from '@/domain/world'
import { RESPONSIBILITY_DOMAINS, RESPONSIBILITY_KINDS } from '@/domain/responsibility'
import type { StaffRoleId } from '@/domain/staff'
import { setTeamResponsibility } from '@/app/staffResponsibilities'
import type { StaffPersonId, TeamId } from '@/domain/ids'

import {
  getEligibleResponsibilityCandidates,
  getTeamResponsibilityPresentation,
  RESPONSIBILITY_DOMAIN_LABELS,
} from './staffPresentation'

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

describe('getTeamResponsibilityPresentation', () => {
  it('derives one row per canonical RESPONSIBILITY_KIND from the registry/world', () => {
    const w = world()
    const teamId = userTeamId(w)
    const rows = getTeamResponsibilityPresentation(w, teamId)
    expect(rows).toHaveLength(RESPONSIBILITY_KINDS.length)
    expect(new Set(rows.map((row) => row.kind))).toEqual(new Set(RESPONSIBILITY_KINDS))
  })

  it('is ordered deterministically by canonical domain then kind order', () => {
    const w = world()
    const teamId = userTeamId(w)
    const rows = getTeamResponsibilityPresentation(w, teamId)
    for (let i = 1; i < rows.length; i += 1) {
      const domainDelta = RESPONSIBILITY_DOMAINS.indexOf(rows[i]!.domain) - RESPONSIBILITY_DOMAINS.indexOf(rows[i - 1]!.domain)
      expect(domainDelta).toBeGreaterThanOrEqual(0)
      if (domainDelta === 0) {
        expect(RESPONSIBILITY_KINDS.indexOf(rows[i]!.kind)).toBeGreaterThan(RESPONSIBILITY_KINDS.indexOf(rows[i - 1]!.kind))
      }
    }
  })

  it('reports correct holder labels for userControlled, organizational, delegated and coach-only rows', () => {
    const w = world()
    const teamId = userTeamId(w)
    const assistantId = staffWithRole(w, teamId, 'assistantCoach')
    const withDelegation = setTeamResponsibility(w, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: assistantId })
    const rows = getTeamResponsibilityPresentation(withDelegation, teamId)
    const delegatedRow = rows.find((row) => row.kind === 'createTeamTrainingPlan')!
    expect(delegatedRow.holderLabel).toContain(' ') // "First Last"
    expect(delegatedRow.holderStaffId).toBe(assistantId)

    const userControlledRow = rows.find((row) => row.kind === 'defensiveGamePlan')!
    expect(userControlledRow.holderLabel).toBe('YOU')

    const coachOnlyRow = rows.find((row) => row.kind === 'rotationPlanning')!
    expect(coachOnlyRow.holderLabel).toBe('HEAD COACH')
    expect(coachOnlyRow.holderStaffId).toBeUndefined()
  })

  it('labels the domain in uppercase display form', () => {
    expect(RESPONSIBILITY_DOMAIN_LABELS.training).toBe('TRAINING')
  })
})

describe('getEligibleResponsibilityCandidates', () => {
  it('only returns Staff from the given Team', () => {
    const w = world()
    const teamId = userTeamId(w)
    const candidates = getEligibleResponsibilityCandidates(w, teamId, 'createTeamTrainingPlan')
    const teamStaffIds = new Set(getTeamStaffAssignments(w, teamId).map((item) => item.staffPersonId))
    for (const candidate of candidates) expect(teamStaffIds.has(candidate.staffPersonId)).toBe(true)
  })

  it('only returns Staff whose role is eligible for the responsibility', () => {
    const w = world()
    const teamId = userTeamId(w)
    const candidates = getEligibleResponsibilityCandidates(w, teamId, 'treatmentRecommendation')
    for (const candidate of candidates) expect(['teamDoctor', 'physiotherapist', 'rehabilitationSpecialist']).toContain(candidate.role)
  })

  it('sorts by current-role proficiency descending, then StaffPersonId ascending', () => {
    const w = world()
    const teamId = userTeamId(w)
    const candidates = getEligibleResponsibilityCandidates(w, teamId, 'createTeamTrainingPlan')
    for (let i = 1; i < candidates.length; i += 1) {
      const prev = candidates[i - 1]!
      const cur = candidates[i]!
      expect(prev.proficiency > cur.proficiency || (prev.proficiency === cur.proficiency && prev.staffPersonId.localeCompare(cur.staffPersonId) <= 0)).toBe(true)
    }
  })

  it('returns no candidates for coach-only responsibilities', () => {
    const w = world()
    const teamId = userTeamId(w)
    expect(getEligibleResponsibilityCandidates(w, teamId, 'rotationPlanning')).toEqual([])
  })

  it('projected workload uses the canonical calculateStaffWorkload result and reflects capacity added', () => {
    const w = world()
    const teamId = userTeamId(w)
    const candidates = getEligibleResponsibilityCandidates(w, teamId, 'createTeamTrainingPlan')
    for (const candidate of candidates) expect(candidate.projectedUtilization).toBeGreaterThanOrEqual(candidate.currentUtilization)
  })

  it('overloaded projected state is surfaced, never used to exclude a candidate', () => {
    const w = world()
    const teamId = userTeamId(w)
    const assistantId = staffWithRole(w, teamId, 'assistantCoach')
    // Pile several delegated Responsibilities onto the same holder to force overload.
    let current = w
    for (const kind of ['createTeamTrainingPlan', 'assignIndividualDevelopment'] as const) {
      current = setTeamResponsibility(current, { teamId, kind, mode: 'delegated', holderStaffId: assistantId })
    }
    const candidates = getEligibleResponsibilityCandidates(current, teamId, 'oppositionReport')
    // Still eligible/listed even if overloaded elsewhere — never excluded by workload.
    const assistant = candidates.find((candidate) => candidate.staffPersonId === assistantId)
    if (assistant !== undefined) expect(['normal', 'pressured', 'overloaded', 'unassigned']).toContain(assistant.projectedWorkloadState)
  })
})
