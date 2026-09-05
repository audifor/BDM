import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { createInjury } from '@/domain/injury'
import {
  injuryIdFromString,
  organizationIdForTeam,
  staffPersonIdFromString,
  teamStaffAssignmentIdFromString,
} from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { progressMedicalAdvisories } from '@/engine/injury/MedicalAdvisory'
import { progressScoutingAssignments, requestScouting } from '@/engine/scouting'

import { buildRosterStaffComments } from './buildRosterStaffComments'

const flatAttributes = Object.fromEntries(
  STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60]),
) as Record<(typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS)[number], number>

function completeAssignments(world: ReturnType<typeof createNewGame>) {
  let current = progressScoutingAssignments(world)
  for (let day = 0; day < 8; day += 1) {
    current = progressScoutingAssignments(updateGameWorld(current, { currentDate: addDays(current.currentDate, 1) }))
  }
  return current
}

describe('buildRosterStaffComments', () => {
  it('returns no invented comments when the staff has not written about the player', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[0]!
    const model = buildRosterStaffComments(world, team.id, playerId)

    expect(model.groups).toEqual([])
  })

  it('groups a medical advisory about the injured player and ignores teammates', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const playerId = team.rosterPlayerIds[0]!
    const otherId = team.rosterPlayerIds[1]!
    const staffId = staffPersonIdFromString('roster-staff-comments-doctor')
    const injured = updateGameWorld(base, {
      injuries: [
        ...Object.values(base.injuriesById),
        createInjury({
          id: injuryIdFromString('roster-staff-comments-injury'),
          playerId,
          kind: 'ankleSprain',
          severity: 'moderate',
          injuredOn: base.currentDate,
          expectedReturnDate: '2099-01-01' as never,
        }),
      ],
      staffPeople: [
        ...Object.values(base.staffPeopleById),
        { id: staffId, identity: { firstName: 'Med', lastName: 'Ic' }, professional: { attributes: flatAttributes } },
      ],
      teamStaffAssignments: [
        ...Object.values(base.teamStaffAssignmentsById),
        {
          id: teamStaffAssignmentIdFromString('roster-staff-comments-doctor-assignment'),
          staffPersonId: staffId,
          teamId: team.id,
          role: 'teamDoctor' as never,
          assignedOn: base.currentDate,
        },
      ],
      responsibilities: [
        ...Object.values(base.responsibilitiesById).filter(
          (item) => item.id !== (`responsibility:${team.id}:returnToPlayRecommendation` as never),
        ),
        {
          id: `responsibility:${team.id}:returnToPlayRecommendation` as never,
          teamId: team.id,
          kind: 'returnToPlayRecommendation',
          mode: 'advisory',
          holderStaffId: staffId,
        },
      ],
    })
    const world = progressMedicalAdvisories(injured)
    const aboutPlayer = buildRosterStaffComments(world, team.id, playerId)
    const aboutTeammate = buildRosterStaffComments(world, team.id, otherId)

    expect(aboutPlayer.groups.map((group) => group.level)).toEqual(['MEDICAL'])
    expect(aboutPlayer.groups[0]?.comments[0]?.title).toMatch(/return-to-play/i)
    expect(aboutPlayer.groups[0]?.comments[0]?.staffName).toBe('Med Ic')
    expect(aboutTeammate.groups).toEqual([])
  })

  it('includes completed scouting reports as scouting-level comments without player truth', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const scout = Object.values(world.teamStaffAssignmentsById).find(
      (item) => item.teamId === team.id && item.role === 'regionalScout',
    )!
    const playerId = team.rosterPlayerIds[0]!
    const requested = requestScouting(world, {
      organizationId: organizationIdForTeam(team.id),
      playerId,
      missionType: 'QUICK_LOOK',
      evaluatorStaffId: scout.staffPersonId,
    })
    const completed = completeAssignments(requested)
    const model = buildRosterStaffComments(completed, team.id, playerId)
    const scouting = model.groups.find((group) => group.level === 'SCOUTING')

    expect(scouting).toBeDefined()
    expect(scouting?.comments[0]?.title).toBe('Quick look')
    expect(JSON.stringify(model)).not.toMatch(/actualRating|truthValue|canonicalPlayer/)
    expect(JSON.stringify(model)).not.toContain('ratings')
  })
})
