import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createNewGame, getCurrentSeason, simulateAndApplyGame, startNextSeason } from '@/app/game'
import { NAVIGATION } from '@/ui/App'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import type { StaffPerson, TeamStaffAssignment } from '@/domain/staff'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/ui/staffPresentation'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'

import { StaffScreen } from './StaffScreen'

describe('StaffScreen', () => {
  it('adds STAFF to main navigation', () => {
    expect(NAVIGATION).toContainEqual({ id: 'staff', label: 'STAFF' })
  })

  it('renders each user-team Staff role and a common professional detail', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const markup = renderToStaticMarkup(createElement(StaffScreen, { world }))

    expect(markup).toContain('STAFF')
    expect(markup).toContain('ASSISTANT COACH')
    expect(markup).toContain('SCOUT')
    expect(markup).toContain('MEDICAL')
    expect(markup).toContain('CURRENT ROLE')
    expect(markup).toContain('ROLE PROFICIENCY')
    expect(markup).toContain('ROLE EVALUATION')
    for (const attribute of STAFF_PROFESSIONAL_ATTRIBUTE_KEYS) expect(markup).toContain(attributeLabel(attribute))
    expect(markup).toContain(world.staffPeopleById[Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.teamId === team.id)!.staffPersonId]!.identity.firstName)
  })

  it('shows every common attribute and cross-role evaluation for Medical Staff', () => {
    const world = createNewGame()
    const medical = Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.teamId === getUserTeam(world)!.id && assignment.role === 'medical')!
    const markup = renderToStaticMarkup(createElement(StaffScreen, { world, initialSelectedStaffId: medical.staffPersonId }))

    expect(markup).toContain('Coaching')
    expect(markup).toContain('Talent Evaluation')
    expect(markup).toContain('Medical Knowledge')
    expect(markup).toContain('Rehabilitation')
    expect(markup).toContain('ASSISTANT COACH')
    expect(markup).toContain('SCOUT')
    expect(markup).toContain('MEDICAL')
  })

  it('shows every common attribute for Scout and Assistant Staff', () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    const scout = Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.teamId === userTeam.id && assignment.role === 'scout')!
    const assistant = Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.teamId === userTeam.id && assignment.role === 'assistantCoach')!

    const scoutMarkup = renderToStaticMarkup(createElement(StaffScreen, { world, initialSelectedStaffId: scout.staffPersonId }))
    const assistantMarkup = renderToStaticMarkup(createElement(StaffScreen, { world, initialSelectedStaffId: assistant.staffPersonId }))
    expect(scoutMarkup).toContain('Medical Knowledge')
    expect(scoutMarkup).toContain('Rehabilitation')
    expect(assistantMarkup).toContain('Potential Evaluation')
    expect(assistantMarkup).toContain('Medical Knowledge')
  })

  it('renders multiple Staff with the same role using their identities', () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    const source = Object.values(world.staffPeopleById)[0]!
    const assistant: StaffPerson = { ...source, id: staffPersonIdFromString('test-staff-second-assistant'), identity: { firstName: 'Second', lastName: 'Assistant' } }
    const assignment: TeamStaffAssignment = { id: teamStaffAssignmentIdFromString('test-staff-assignment-second-assistant'), staffPersonId: assistant.id, teamId: userTeam.id, role: 'assistantCoach', assignedOn: world.currentDate }
    const markup = renderToStaticMarkup(createElement(StaffScreen, { world: rebuildWorld(world, [...Object.values(world.staffPeopleById), assistant], [...Object.values(world.teamStaffAssignmentsById), assignment]) }))

    expect(markup).toContain('Second Assistant')
  })

  it('renders an empty state when the user Team has no Staff', () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    const retainedAssignments = Object.values(world.teamStaffAssignmentsById).filter((assignment) => assignment.teamId !== userTeam.id)
    const retainedPeople = retainedAssignments.map((assignment) => world.staffPeopleById[assignment.staffPersonId]!)
    const markup = renderToStaticMarkup(createElement(StaffScreen, { world: rebuildWorld(world, retainedPeople, retainedAssignments) }))

    expect(markup).toContain('NO STAFF ASSIGNED')
  })

  it('renders the same Staff after save/load and a season transition', () => {
    const completed = completeCurrentSeason(createNewGame())
    const transitioned = startNextSeason(completed)
    const loaded = deserializeGameWorldV1(serializeGameWorldV1(transitioned, '2033-10-01T00:00:00.000Z'))
    const markup = renderToStaticMarkup(createElement(StaffScreen, { world: loaded }))

    for (const assignment of Object.values(transitioned.teamStaffAssignmentsById).filter((candidate) => candidate.teamId === getUserTeam(transitioned)!.id)) {
      const person = transitioned.staffPeopleById[assignment.staffPersonId]!
      expect(markup).toContain(`${person.identity.firstName} ${person.identity.lastName}`)
    }
  })
})

function rebuildWorld(world: GameWorld, staffPeople: readonly StaffPerson[], teamStaffAssignments: readonly TeamStaffAssignment[]): GameWorld {
  return createGameWorld({ currentDate: world.currentDate, currentSeasonId: world.currentSeasonId, userCoachId: world.userCoachId, countries: Object.values(world.countries), coaches: Object.values(world.coaches), players: Object.values(world.players), teams: Object.values(world.teams), competitions: Object.values(world.competitions), seasons: Object.values(world.seasons), games: Object.values(world.games), matchStatLogs: Object.values(world.matchStatLogsByGameId), seasonHistory: Object.values(world.seasonHistoryBySeasonId), injuries: Object.values(world.injuriesById), contracts: Object.values(world.contractsById), teamFinances: Object.values(world.teamFinancesByTeamId), playerTransactions: Object.values(world.playerTransactionsById), playerKnowledge: Object.values(world.playerKnowledgeById), staffPeople, teamStaffAssignments })
}

function attributeLabel(attribute: typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number]): string {
  return attribute.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase())
}

function completeCurrentSeason(world: GameWorld): GameWorld {
  return Object.values(world.games).filter((game) => game.status === 'scheduled').reduce((current, game) => simulateAndApplyGame(current, game), world)
}
