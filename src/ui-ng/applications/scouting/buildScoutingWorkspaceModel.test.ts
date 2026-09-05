import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { addDays } from '@/domain/date'
import { organizationIdForTeam } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { progressScoutingAssignments, requestScouting } from '@/engine/scouting'
import { buildScoutingWorkspaceModel } from '@/ui-ng/applications/scouting/buildScoutingWorkspaceModel'

function completeAssignments(world: ReturnType<typeof createNewGame>) {
  let current = progressScoutingAssignments(world)
  for (let day = 0; day < 8; day += 1) {
    current = progressScoutingAssignments(updateGameWorld(current, { currentDate: addDays(current.currentDate, 1) }))
  }
  return current
}

describe('buildScoutingWorkspaceModel', () => {
  it('lists own roster without leaking hidden ratings when no knowledge exists', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const model = buildScoutingWorkspaceModel(world)

    expect(model).not.toBeNull()
    expect(model?.teamName).toBe(team.name)
    expect(model?.knowledge.some((row) => row.isOwnRoster)).toBe(true)
    expect(model?.canRequestScouting).toBe(true)
    expect(model?.knownSubjectCount).toBe(0)
    expect(model?.assignments).toEqual([])
    expect(model?.reports).toEqual([])

    const subject = model!.knowledge.find((row) => row.isOwnRoster)!
    const player = world.players[subject.playerId]!
    expect(subject.evaluations.every((evaluation) => evaluation.evaluationLabel === '?')).toBe(true)
    expect(subject.valuationCurrent).toBeNull()
    expect(JSON.stringify(subject)).not.toContain(JSON.stringify(player.basketball.ratings))
    expect(JSON.stringify(model)).not.toMatch(/actualRating|truthValue|canonicalPlayer/)
  })

  it('surfaces completed assignments and reports through organization knowledge, not player truth', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const organizationId = organizationIdForTeam(team.id)
    const scout = Object.values(world.teamStaffAssignmentsById).find(
      (item) => item.teamId === team.id && item.role === 'regionalScout',
    )!
    const target = Object.values(world.players).find((player) => !team.rosterPlayerIds.includes(player.id))!
    const requested = requestScouting(world, {
      organizationId,
      playerId: target.id,
      missionType: 'QUICK_LOOK',
      evaluatorStaffId: scout.staffPersonId,
    })
    const completed = completeAssignments(requested)
    const model = buildScoutingWorkspaceModel(completed)!

    expect(model.assignments).toHaveLength(1)
    expect(model.assignments[0]?.status).toBe('COMPLETED')
    expect(model.assignments[0]?.missionLabel).toBe('Quick look')
    expect(model.assignments[0]?.evaluatorName).not.toMatch(/undefined/)
    expect(model.assignments[0]?.evaluatorName).toContain(' ')
    expect(model.reports).toHaveLength(1)
    expect(model.knownSubjectCount).toBeGreaterThan(0)
    expect(model.knowledge.some((row) => row.playerId === target.id && row.knownDomains.length > 0)).toBe(true)
    expect(JSON.stringify(model.reports)).not.toContain('ratings')
    expect(model.reports[0]?.evaluatorName).not.toMatch(/undefined/)
    expect(model.reports[0]?.findings.every((finding) => finding.evaluationLabel !== '')).toBe(true)
    expect(JSON.stringify(model)).not.toMatch(/actualRating|truthValue|canonicalPlayer/)
  })

  it('does not change displayed knowledge when hidden player truth changes', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const player = world.players[team.rosterPlayerIds[0]!]!
    const before = buildScoutingWorkspaceModel(world)!
    const beforeRow = before.knowledge.find((row) => row.playerId === player.id)!
    const altered = updateGameWorld(world, {
      players: Object.values(world.players).map((candidate) =>
        candidate.id === player.id
          ? {
              ...candidate,
              basketball: {
                ...candidate.basketball,
                ratings: { ...candidate.basketball.ratings, threePointShooting: 100, passing: 100 },
              },
            }
          : candidate,
      ),
    })
    const after = buildScoutingWorkspaceModel(altered)!
    const afterRow = after.knowledge.find((row) => row.playerId === player.id)!
    expect(afterRow.evaluations).toEqual(beforeRow.evaluations)
    expect(afterRow.valuationCurrent).toBe(beforeRow.valuationCurrent)
    expect(afterRow.valuationCurrent).toBeNull()
  })
})
