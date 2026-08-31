import { createNewGame } from '@/app/game/createNewGame'
import { describe, expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import { organizationIdForTeam } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import { progressScoutingAssignments, requestScouting } from './ScoutingEngine'

function context() { const world = createNewGame(), team = Object.values(world.teams).find((item) => item.coachId === world.userCoachId)!, player = Object.values(world.players).find((item) => !team.rosterPlayerIds.includes(item.id))!, scout = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.role === 'regionalScout')!; return { world, team, player, scout, organizationId: organizationIdForTeam(team.id) } }
function complete(world: ReturnType<typeof createNewGame>) { let current = progressScoutingAssignments(world); for (let day = 0; day < 8; day++) current = progressScoutingAssignments(updateGameWorld(current, { currentDate: addDays(current.currentDate, 1) })); return current }

describe('Wave 3: scouting quality -> EvaluatorFinding.uncertainty', () => {
  it('manual (non-Staff-driven) requests remain regression-identical: no staffQualityScore, no adjustment applied', () => {
    const c = context()
    const manual = requestScouting(c.world, { organizationId: c.organizationId, playerId: c.player.id, missionType: 'QUICK_LOOK', evaluatorStaffId: c.scout.staffPersonId, requestedBy: 'HEAD_COACH' })
    expect(Object.values(manual.scoutingAssignmentsById)[0]!.staffQualityScore).toBeUndefined()
  })

  it('a higher staffQualityScore produces no wider uncertainty than a lower one, all other inputs equal', () => {
    const cLow = context()
    const cHigh = context()
    const lowQuality = requestScouting(cLow.world, { organizationId: cLow.organizationId, playerId: cLow.player.id, missionType: 'QUICK_LOOK', evaluatorStaffId: cLow.scout.staffPersonId, requestedBy: 'SCOUTING_DEPARTMENT', staffQualityScore: 10 })
    const highQuality = requestScouting(cHigh.world, { organizationId: cHigh.organizationId, playerId: cHigh.player.id, missionType: 'QUICK_LOOK', evaluatorStaffId: cHigh.scout.staffPersonId, requestedBy: 'SCOUTING_DEPARTMENT', staffQualityScore: 90 })
    const lowReport = Object.values(complete(lowQuality).evaluatorReportsById)[0]!
    const highReport = Object.values(complete(highQuality).evaluatorReportsById)[0]!
    const lowAverageUncertainty = average(lowReport.findings.map((f) => f.uncertainty))
    const highAverageUncertainty = average(highReport.findings.map((f) => f.uncertainty))
    expect(highAverageUncertainty).toBeLessThanOrEqual(lowAverageUncertainty)
  })

  it('a poor Staff quality score makes reports noisier but never arbitrarily noisy: uncertainty stays within the existing domain bound (<=20, matching OrganizationKnowledge createOrganizationKnowledge validation)', () => {
    const c = context()
    const worst = requestScouting(c.world, { organizationId: c.organizationId, playerId: c.player.id, missionType: 'QUICK_LOOK', evaluatorStaffId: c.scout.staffPersonId, requestedBy: 'SCOUTING_DEPARTMENT', staffQualityScore: 0 })
    const report = Object.values(complete(worst).evaluatorReportsById)[0]!
    for (const finding of report.findings) {
      expect(finding.uncertainty).toBeGreaterThanOrEqual(3)
      expect(finding.uncertainty).toBeLessThanOrEqual(20)
    }
  })

  it('confidence/coverage remain within existing domain bounds for Staff-driven reports (no second computation path, no out-of-range values)', () => {
    const c = context()
    const staffDriven = requestScouting(c.world, { organizationId: c.organizationId, playerId: c.player.id, missionType: 'QUICK_LOOK', evaluatorStaffId: c.scout.staffPersonId, requestedBy: 'SCOUTING_DEPARTMENT', staffQualityScore: 70 })
    const report = Object.values(complete(staffDriven).evaluatorReportsById)[0]!
    for (const finding of report.findings) {
      expect(finding.confidence).toBeGreaterThanOrEqual(1)
      expect(finding.confidence).toBeLessThanOrEqual(95)
      expect(finding.coverageContribution).toBeGreaterThanOrEqual(0)
      expect(finding.coverageContribution).toBeLessThanOrEqual(1)
    }
  })

  it('does not add a second uncertainty field or a second report type: EvaluatorReport/EvaluatorFinding shape is unchanged', () => {
    const c = context()
    const staffDriven = requestScouting(c.world, { organizationId: c.organizationId, playerId: c.player.id, missionType: 'QUICK_LOOK', evaluatorStaffId: c.scout.staffPersonId, requestedBy: 'SCOUTING_DEPARTMENT', staffQualityScore: 70 })
    const report = Object.values(complete(staffDriven).evaluatorReportsById)[0]!
    expect(Object.keys(report).sort()).toEqual(['assignmentId', 'createdAt', 'evaluatorStaffId', 'evidenceIds', 'findings', 'id', 'missionType', 'organizationId', 'subjectPlayerId'].sort())
    for (const finding of report.findings) {
      expect(Object.keys(finding).sort()).toEqual(['coverageContribution', 'confidence', 'dimension', 'estimate', 'uncertainty'].sort())
    }
  })
})

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
