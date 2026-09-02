import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString, staffPersonIdFromString, teamStaffAssignmentIdFromString, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { progressMedicalAdvisories } from '@/engine/injury/MedicalAdvisory'
import { getStaffRecommendationsForTeam } from './staffRecommendationPresentation'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60])) as StaffAttributes

function withStaffInRole(world: GameWorld, teamId: TeamId, role: string, kind: 'treatmentRecommendation' | 'oppositionScouting' | 'prospectIdentification' | 'tradeRecommendation' | 'contractRecommendation' | 'oppositionReport' | 'prospectReport' | 'defensiveGamePlan', staffLastName = 'Ic') {
  const staffId = staffPersonIdFromString(`presentation-staff-${role}-${kind}-${teamId}`)
  const withStaff = updateGameWorld(world, {
    staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Med', lastName: staffLastName }, professional: { attributes: flatAttributes } }],
    teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`presentation-assignment-${role}-${kind}-${teamId}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
  })
  const id = `responsibility:${teamId}:${kind}` as never
  const delegated = updateGameWorld(withStaff, {
    responsibilities: [...Object.values(withStaff.responsibilitiesById).filter((responsibility) => responsibility.id !== id), { id, teamId, kind, mode: 'advisory', holderStaffId: staffId }],
  })
  return { world: delegated, staffId }
}

function withActiveInjury(world: GameWorld, teamId: TeamId, suffix = '') {
  const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
  const injury = createInjury({ id: injuryIdFromString(`presentation-injury-${teamId}${suffix}`), playerId, kind: 'ankleSprain', severity: 'moderate', injuredOn: world.currentDate, expectedReturnDate: '2099-01-01' as never })
  return { world: updateGameWorld(world, { injuries: [...Object.values(world.injuriesById), injury] }), injury }
}

function medicalPendingFixture() {
  const base = createNewGame()
  const teamId = Object.values(base.teams)[0]!.id
  const { world: withInjury } = withActiveInjury(base, teamId)
  const { world: withStaff, staffId } = withStaffInRole(withInjury, teamId, 'teamDoctor', 'treatmentRecommendation')
  const progressed = progressMedicalAdvisories(withStaff)
  const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'treatmentRecommendation')!
  return { world: progressed, outcome, teamId, staffId }
}

describe('getStaffRecommendationsForTeam', () => {
  it('only includes outcomes belonging to the requested Team, via Responsibility.teamId', () => {
    const { world, teamId, outcome } = medicalPendingFixture()
    const otherTeamId = Object.values(world.teams).find((team) => team.id !== teamId)!.id
    const forRequestedTeam = getStaffRecommendationsForTeam(world, teamId)
    const forOtherTeam = getStaffRecommendationsForTeam(world, otherTeamId)
    expect(forRequestedTeam.some((item) => item.outcomeId === outcome.id)).toBe(true)
    expect(forOtherTeam.some((item) => item.outcomeId === outcome.id)).toBe(false)
  })

  it('excludes an automatic/delegated applied outcome with no known acceptance seam and no user disposition', () => {
    const { world, teamId } = medicalPendingFixture()
    const responsibilityId = `responsibility:${teamId}:assignScouts` as never
    const holderId = Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.teamId === teamId && assignment.role === 'regionalScout')!.staffPersonId
    const autoAppliedId = 'delegation-outcome:auto-applied' as never
    const withAuto = updateGameWorld(world, {
      responsibilities: [...Object.values(world.responsibilitiesById).filter((item) => item.id !== responsibilityId), { id: responsibilityId, teamId, kind: 'assignScouts', mode: 'delegated', holderStaffId: holderId }],
      delegationOutcomes: [...Object.values(world.delegationOutcomesById), { id: autoAppliedId, responsibilityId, staffId: holderId, decidedOn: world.currentDate, kind: 'assignScouts', applied: true, qualityScore: 60, payload: {} }],
    })
    const items = getStaffRecommendationsForTeam(withAuto, teamId)
    expect(items.some((item) => item.outcomeId === autoAppliedId)).toBe(false)
  })

  it('a pending advisory outcome (applied false, no disposition, acceptance seam exists) appears as PENDING/ACCEPTABLE', () => {
    const { world, teamId, outcome } = medicalPendingFixture()
    const items = getStaffRecommendationsForTeam(world, teamId)
    const item = items.find((entry) => entry.outcomeId === outcome.id)!
    expect(item.status).toBe('PENDING')
    expect(item.actionability).toBe('ACCEPTABLE')
  })

  it('an informational outcome (no acceptance seam, not applied) appears as INFORMATIONAL/VIEW_ONLY', () => {
    const { world, teamId } = medicalPendingFixture()
    const { world: withScouting, staffId } = withStaffInRole(world, teamId, 'assistantCoach', 'oppositionScouting')
    const outcomeId = 'delegation-outcome:opposition-scouting-informational' as never
    const withOutcome = updateGameWorld(withScouting, {
      delegationOutcomes: [...Object.values(withScouting.delegationOutcomesById), { id: outcomeId, responsibilityId: `responsibility:${teamId}:oppositionScouting` as never, staffId, decidedOn: withScouting.currentDate, kind: 'oppositionScouting', applied: false, qualityScore: 55, payload: { flaggedPlayerCount: 2 } }],
    })
    const items = getStaffRecommendationsForTeam(withOutcome, teamId)
    const item = items.find((entry) => entry.outcomeId === outcomeId)!
    expect(item.status).toBe('INFORMATIONAL')
    expect(item.actionability).toBe('VIEW_ONLY')
  })

  it('an accepted (userDisposition) outcome appears as ACCEPTED history', () => {
    const { world, teamId, outcome } = medicalPendingFixture()
    const accepted = updateGameWorld(world, { delegationOutcomes: [...Object.values(world.delegationOutcomesById).filter((item) => item.id !== outcome.id), { ...outcome, applied: true, userDisposition: 'accepted', userDecidedOn: world.currentDate }] })
    const items = getStaffRecommendationsForTeam(accepted, teamId)
    const item = items.find((entry) => entry.outcomeId === outcome.id)!
    expect(item.status).toBe('ACCEPTED')
    expect(item.actionability).toBe('VIEW_ONLY')
  })

  it('a dismissed outcome appears as DISMISSED history', () => {
    const { world, teamId, outcome } = medicalPendingFixture()
    const dismissed = updateGameWorld(world, { delegationOutcomes: [...Object.values(world.delegationOutcomesById).filter((item) => item.id !== outcome.id), { ...outcome, applied: false, userDisposition: 'dismissed', userDecidedOn: world.currentDate }] })
    const items = getStaffRecommendationsForTeam(dismissed, teamId)
    const item = items.find((entry) => entry.outcomeId === outcome.id)!
    expect(item.status).toBe('DISMISSED')
    expect(item.actionability).toBe('VIEW_ONLY')
  })

  it('legacy applied:true with no disposition, on a known acceptance-seam kind, is treated as ACCEPTED', () => {
    const { world, teamId, outcome } = medicalPendingFixture()
    const legacy = updateGameWorld(world, { delegationOutcomes: [...Object.values(world.delegationOutcomesById).filter((item) => item.id !== outcome.id), { ...outcome, applied: true }] })
    const items = getStaffRecommendationsForTeam(legacy, teamId)
    const item = items.find((entry) => entry.outcomeId === outcome.id)!
    expect(item.status).toBe('ACCEPTED')
  })

  it('sorting is deterministic: unresolved before history, then decidedOn desc, then domain/kind/outcomeId', () => {
    const { world, teamId } = medicalPendingFixture()
    const items = getStaffRecommendationsForTeam(world, teamId)
    for (let i = 1; i < items.length; i += 1) {
      const prevUnresolved = items[i - 1]!.status === 'PENDING' || items[i - 1]!.status === 'INFORMATIONAL'
      const curUnresolved = items[i]!.status === 'PENDING' || items[i]!.status === 'INFORMATIONAL'
      expect(prevUnresolved || !curUnresolved).toBe(true)
    }
  })

  it('resolves the real Staff author name', () => {
    const { world, teamId, outcome } = medicalPendingFixture()
    const items = getStaffRecommendationsForTeam(world, teamId)
    const item = items.find((entry) => entry.outcomeId === outcome.id)!
    expect(item.staffName).toBe('Med Ic')
  })

  it('resolves the correct domain from the Responsibility registry', () => {
    const { world, teamId, outcome } = medicalPendingFixture()
    const items = getStaffRecommendationsForTeam(world, teamId)
    const item = items.find((entry) => entry.outcomeId === outcome.id)!
    expect(item.domain).toBe('medical')
  })

  it('medical formatter: summary includes the player name and a recovery/return adjustment label', () => {
    const { world, teamId, outcome } = medicalPendingFixture()
    const player = world.players[outcome.payload.playerId as never]!
    const items = getStaffRecommendationsForTeam(world, teamId)
    const item = items.find((entry) => entry.outcomeId === outcome.id)!
    expect(item.summary).toContain(`${player.firstName} ${player.lastName}`)
    expect(item.detailRows.some((row) => row.label === 'PLAYER')).toBe(true)
    expect(item.detailRows.some((row) => row.label === 'RECOMMENDED ADJUSTMENT')).toBe(true)
  })

  it('recruiting formatter: prospectIdentification summary reads "Add [Recruit] to recruiting board"', () => {
    const { world, teamId } = medicalPendingFixture()
    const recruitId = Object.keys(world.recruitProfilesById)[0]
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'recruitingCoordinator', 'prospectIdentification')
    const outcomeId = 'delegation-outcome:prospect-identification-presentation' as never
    const withOutcome = updateGameWorld(withStaff, {
      delegationOutcomes: [...Object.values(withStaff.delegationOutcomesById), { id: outcomeId, responsibilityId: `responsibility:${teamId}:prospectIdentification` as never, staffId, decidedOn: withStaff.currentDate, kind: 'prospectIdentification', applied: false, qualityScore: 60, payload: recruitId === undefined ? {} : { recruitId } }],
    })
    const items = getStaffRecommendationsForTeam(withOutcome, teamId)
    const item = items.find((entry) => entry.outcomeId === outcomeId)!
    expect(item.summary).toContain('Add')
    expect(item.summary).toContain('to recruiting board')
  })

  it('trade formatter: summary reads "Trade [Outgoing] for [Incoming]" with counterpart as secondaryLabel', () => {
    const { world, teamId } = medicalPendingFixture()
    const teams = Object.values(world.teams)
    const outgoingPlayerId = world.teams[teamId]!.rosterPlayerIds[0]
    const counterpart = teams.find((team) => team.id !== teamId && team.rosterPlayerIds.length > 0)!
    const incomingPlayerId = counterpart.rosterPlayerIds[0]
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'generalManager', 'tradeRecommendation')
    const outcomeId = 'delegation-outcome:trade-presentation' as never
    const withOutcome = updateGameWorld(withStaff, {
      delegationOutcomes: [...Object.values(withStaff.delegationOutcomesById), { id: outcomeId, responsibilityId: `responsibility:${teamId}:tradeRecommendation` as never, staffId, decidedOn: withStaff.currentDate, kind: 'tradeRecommendation', applied: false, qualityScore: 60, payload: { outgoingPlayerId: outgoingPlayerId ?? '', incomingPlayerId: incomingPlayerId ?? '', counterpartTeamId: counterpart.id, confidence: 70 } }],
    })
    const items = getStaffRecommendationsForTeam(withOutcome, teamId)
    const item = items.find((entry) => entry.outcomeId === outcomeId)!
    expect(item.summary).toContain('Trade')
    expect(item.summary).toContain('for')
    expect(item.secondaryLabel).toBe(counterpart.name)
  })

  it('basketball ops view-only formatter: contractRecommendation is VIEW_ONLY and shows player/recommendation', () => {
    const { world, teamId } = medicalPendingFixture()
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'capContractsSpecialist', 'contractRecommendation')
    const outcomeId = 'delegation-outcome:contract-presentation' as never
    const withOutcome = updateGameWorld(withStaff, {
      delegationOutcomes: [...Object.values(withStaff.delegationOutcomesById), { id: outcomeId, responsibilityId: `responsibility:${teamId}:contractRecommendation` as never, staffId, decidedOn: withStaff.currentDate, kind: 'contractRecommendation', applied: false, qualityScore: 60, payload: { playerId: playerId ?? '', recommendation: 'renew', annualSalary: 1000000, recommendedAnnualSalary: 1050000, budgetStatus: 'healthy', confidence: 80 } }],
    })
    const items = getStaffRecommendationsForTeam(withOutcome, teamId)
    const item = items.find((entry) => entry.outcomeId === outcomeId)!
    expect(item.actionability).toBe('VIEW_ONLY')
    expect(item.detailRows.some((row) => row.label === 'RECOMMENDATION')).toBe(true)
  })

  it('scouting formatter: oppositionReport payload with targetPlayerId reads "Scouting requested: [Player]"', () => {
    const { world, teamId } = medicalPendingFixture()
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const player = world.players[playerId]!
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'regionalScout', 'oppositionReport')
    const outcomeId = 'delegation-outcome:opposition-report-presentation' as never
    const withOutcome = updateGameWorld(withStaff, {
      delegationOutcomes: [...Object.values(withStaff.delegationOutcomesById), { id: outcomeId, responsibilityId: `responsibility:${teamId}:oppositionReport` as never, staffId, decidedOn: withStaff.currentDate, kind: 'oppositionReport', applied: false, qualityScore: 60, payload: { targetPlayerId: playerId, missionType: 'scoutOpponent' } }],
    })
    const items = getStaffRecommendationsForTeam(withOutcome, teamId)
    const item = items.find((entry) => entry.outcomeId === outcomeId)!
    expect(item.summary).toBe(`Scouting requested: ${player.firstName} ${player.lastName}`)
    expect(item.actionability).toBe('VIEW_ONLY')
  })

  it('draft formatter: prospectReport payload with recommendedPlayerId reads "Draft recommendation: [Player]"', () => {
    const { world, teamId } = medicalPendingFixture()
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const player = world.players[playerId]!
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'regionalScout', 'prospectReport')
    const outcomeId = 'delegation-outcome:draft-advisory-presentation' as never
    const withOutcome = updateGameWorld(withStaff, {
      delegationOutcomes: [...Object.values(withStaff.delegationOutcomesById), { id: outcomeId, responsibilityId: `responsibility:${teamId}:prospectReport` as never, staffId, decidedOn: withStaff.currentDate, kind: 'prospectReport', applied: false, qualityScore: 60, payload: { draftId: 'draft-1', recommendedPlayerId: playerId } }],
    })
    const items = getStaffRecommendationsForTeam(withOutcome, teamId)
    const item = items.find((entry) => entry.outcomeId === outcomeId)!
    expect(item.summary).toBe(`Draft recommendation: ${player.firstName} ${player.lastName}`)
    expect(item.actionability).toBe('VIEW_ONLY')
  })

  it('opposition scouting formatter shows defensive emphasis/pace/flagged count and is VIEW_ONLY', () => {
    const { world, teamId } = medicalPendingFixture()
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'assistantCoach', 'oppositionScouting')
    const outcomeId = 'delegation-outcome:opposition-scouting-presentation' as never
    const withOutcome = updateGameWorld(withStaff, {
      delegationOutcomes: [...Object.values(withStaff.delegationOutcomesById), { id: outcomeId, responsibilityId: `responsibility:${teamId}:oppositionScouting` as never, staffId, decidedOn: withStaff.currentDate, kind: 'oppositionScouting', applied: false, qualityScore: 60, payload: { recommendedDefensiveEmphasis: 'perimeter', recommendedPaceAdjustment: 2, flaggedPlayerCount: 3 } }],
    })
    const items = getStaffRecommendationsForTeam(withOutcome, teamId)
    const item = items.find((entry) => entry.outcomeId === outcomeId)!
    expect(item.actionability).toBe('VIEW_ONLY')
    expect(item.detailRows.find((row) => row.label === 'DEFENSIVE EMPHASIS')?.value).toBe('perimeter')
    expect(item.detailRows.find((row) => row.label === 'FLAGGED PLAYERS COUNT')?.value).toBe('3')
  })

  it('unknown/future outcome kind falls back safely to an informational, dismissible, non-crashing presentation', () => {
    const { world, teamId } = medicalPendingFixture()
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'assistantCoach', 'defensiveGamePlan')
    const outcomeId = 'delegation-outcome:unknown-shape' as never
    const withOutcome = updateGameWorld(withStaff, {
      delegationOutcomes: [...Object.values(withStaff.delegationOutcomesById), { id: outcomeId, responsibilityId: `responsibility:${teamId}:defensiveGamePlan` as never, staffId, decidedOn: withStaff.currentDate, kind: 'defensiveGamePlan', applied: false, qualityScore: 50, payload: { somethingUnexpected: 'value', numericField: 42 } }],
    })
    expect(() => getStaffRecommendationsForTeam(withOutcome, teamId)).not.toThrow()
    const items = getStaffRecommendationsForTeam(withOutcome, teamId)
    const item = items.find((entry) => entry.outcomeId === outcomeId)!
    expect(item.status).toBe('INFORMATIONAL')
    expect(item.actionability).toBe('VIEW_ONLY')
    expect(item.detailRows.length).toBeGreaterThan(0)
  })
})
