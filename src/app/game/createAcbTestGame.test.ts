import { describe, expect, it } from 'vitest'

import { getUserTeam } from '@/engine/calendar'
import { getTeamStaffPayroll } from '@/domain/world'
import { isStaffContractActiveOn } from '@/domain/staffContract'
import { ASSIGNABLE_STAFF_ROLE_IDS, isStaffRoleApplicableToEcosystem } from '@/domain/staff'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'
import { deserializeGameWorldV3, serializeGameWorldV3 } from '@/save/GameWorldSaveV3'
import { acceptStaffJobOffer, completeStaffInterview, createStaffJobOffer, createStaffJobOpeningForTeam, fireStaffFromTeam, identifyStaffCandidate, listFreeAgentStaff, startStaffInterview } from '@/app/staffCareer'
import { acceptCoachJobOffer, completeCoachInterview, createCoachJobOffer, fireCoachFromTeam, identifyCoachCandidate, startCoachInterview } from '@/app/coachCareer'
import { createNewGame } from './createNewGame'
import { createAcbTestGame } from './createAcbTestGame'

describe('createAcbTestGame', () => {
  it('creates the complete ACB 2026/27 regular-season test universe', () => {
    const world = createAcbTestGame({ userTeamKey: 'caz' })
    const userTeam = getUserTeam(world)
    const playerNames = new Set(Object.values(world.players).map((player) => `${player.firstName} ${player.lastName}`))
    const games = Object.values(world.games)

    expect(Object.keys(world.teams)).toHaveLength(18)
    expect(Object.keys(world.players)).toHaveLength(241)
    expect(games).toHaveLength(306)
    expect(new Set(games.map((game) => game.date)).size).toBe(34)
    expect(userTeam?.name).toBe('Casademont Zaragoza')
    expect(userTeam?.coachId).toBe(world.userCoachId)
    expect(playerNames.has('Ricky Rubio')).toBe(true)
    expect(playerNames.has('Facu Campazzo')).toBe(true)
    expect(playerNames.has('Edy Tavares')).toBe(true)
    expect(playerNames.has('Willy Hernangómez')).toBe(true)
    expect(Object.values(world.playerKnowledgeById).filter((record) => record.observerTeamId === userTeam?.id)).toHaveLength(241)
  })

  it('allows any ACB club to become the user team', () => {
    expect(getUserTeam(createAcbTestGame({ userTeamKey: 'rmb' }))?.name).toBe('Real Madrid')
  })

  it('rejects unknown ACB team keys', () => {
    expect(() => createAcbTestGame({ userTeamKey: 'not-a-team' })).toThrow('Unknown ACB test team')
  })

  it('creates deterministic broad staffs and five free agents for every FIBA-applicable role', () => {
    const world = createAcbTestGame({ userTeamKey: 'caz' })
    const sameWorld = createAcbTestGame({ userTeamKey: 'caz' })
    const roles = ASSIGNABLE_STAFF_ROLE_IDS.filter((role) => isStaffRoleApplicableToEcosystem(role, 'fibaLike'))
    expect(roles).toHaveLength(28)
    for (const team of Object.values(world.teams)) {
      const assignments = Object.values(world.teamStaffAssignmentsById).filter((assignment) => assignment.teamId === team.id)
      expect(assignments).toHaveLength(roles.length + 3)
      expect(assignments.every((assignment) => isStaffRoleApplicableToEcosystem(assignment.role, 'fibaLike'))).toBe(true)
      expect(assignments.filter((assignment) => assignment.role === 'assistantCoach')).toHaveLength(2)
      expect(assignments.filter((assignment) => assignment.role === 'physiotherapist')).toHaveLength(2)
      expect(assignments.filter((assignment) => assignment.role === 'regionalScout')).toHaveLength(2)
    }
    for (const role of roles) expect(listFreeAgentStaff(world, role)).toHaveLength(5)
    expect(listFreeAgentStaff(world)).toHaveLength(roles.length * 5)
    const freeCoachIds = Object.values(world.coaches).filter((coach) => String(coach.id).startsWith('acb-free-agent-head-coach-')).map((coach) => coach.id)
    expect(freeCoachIds).toHaveLength(5)
    expect(freeCoachIds.every((coachId) => world.coachEmploymentByCoachId[coachId]!.status === 'unemployed')).toBe(true)
    expect(listFreeAgentStaff(world).every((staffId) => world.staffEmploymentByStaffId[staffId]!.status === 'unemployed')).toBe(true)
    expect(Object.values(world.staffPeopleById)).toEqual(Object.values(sameWorld.staffPeopleById))
  })

  it('uses canonical hiring, firing and save/load for an ACB free agent', () => {
    const world = createAcbTestGame({ userTeamKey: 'caz' })
    const candidate = listFreeAgentStaff(world, 'assistantCoach')[0]!
    const opening = createStaffJobOpeningForTeam(world, { teamId: getUserTeam(world)!.id, roleId: 'assistantCoach' })
    const candidacy = identifyStaffCandidate(opening.world, { openingId: opening.opening.id, staffId: candidate })
    const interviewed = completeStaffInterview(startStaffInterview(candidacy.world, candidacy.candidacyId), candidacy.candidacyId)
    const offer = createStaffJobOffer(interviewed, { candidacyId: candidacy.candidacyId })
    const hired = acceptStaffJobOffer(offer.world, offer.offerId)
    expect(hired.staffEmploymentByStaffId[candidate]!.status).toBe('employed')
    const fired = fireStaffFromTeam(hired, candidate)
    expect(fired.staffEmploymentByStaffId[candidate]!.status).toBe('unemployed')
    expect(listFreeAgentStaff(fired, 'assistantCoach')).toContain(candidate)
    const loaded = deserializeGameWorldV1(serializeGameWorldV1(fired, '2026-09-19T00:00:00.000Z'))
    expect(loaded.staffPeopleById[candidate]).toEqual(fired.staffPeopleById[candidate])
    expect(loaded.staffEmploymentByStaffId[candidate]).toEqual(fired.staffEmploymentByStaffId[candidate])
    expect(loaded.teamStaffAssignmentsById).toEqual(fired.teamStaffAssignmentsById)
    expect(listFreeAgentStaff(loaded, 'assistantCoach')).toContain(candidate)
  })

  it('starts every employed ACB staff member on one active deterministic contract that counts toward payroll', () => {
    const world = createAcbTestGame({ userTeamKey: 'caz' })
    const sameWorld = createAcbTestGame({ userTeamKey: 'caz' })
    for (const team of Object.values(world.teams)) {
      const employed = Object.entries(world.staffEmploymentByStaffId).filter(([, employment]) => employment.status === 'employed' && employment.teamId === team.id).map(([staffId]) => staffId)
      const activeContracts = Object.values(world.staffContractsById).filter((contract) => contract.teamId === team.id && isStaffContractActiveOn(contract, world.currentDate))
      expect(employed).toHaveLength(31)
      expect(activeContracts).toHaveLength(31)
      expect(activeContracts.every((contract) => contract.compensation.annualSalary > 0)).toBe(true)
      const payroll = getTeamStaffPayroll(world, team.id)
      expect(payroll.activeAnnualSalary).toBe(activeContracts.reduce((sum, contract) => sum + contract.compensation.annualSalary, 0))
      expect(payroll.activeAnnualSalary).toBeGreaterThan(0)
      expect(payroll.remainingBudget).toBeGreaterThan(0)
    }
    expect(world.staffContractsById).toEqual(sameWorld.staffContractsById)
    const loaded = deserializeGameWorldV3(serializeGameWorldV3(world, '2026-09-19T00:00:00.000Z'))
    expect(loaded.staffContractsById).toEqual(world.staffContractsById)
  })

  it('keeps initial ACB staff chronology at or before the current game date', () => {
    const world = createAcbTestGame({ userTeamKey: 'caz' })
    for (const assignment of Object.values(world.teamStaffAssignmentsById)) {
      expect(assignment.assignedOn <= world.currentDate).toBe(true)
      const employment = world.staffEmploymentByStaffId[assignment.staffPersonId]!
      expect(employment.startedOn! <= world.currentDate).toBe(true)
      const appointment = world.staffCareerHistoryByStaffId[assignment.staffPersonId]!.find((entry) => entry.kind === 'appointment')!
      expect(appointment.date <= world.currentDate).toBe(true)
    }
    const staffId = Object.values(world.teamStaffAssignmentsById)[0]!.staffPersonId
    const appointment = world.staffCareerHistoryByStaffId[staffId]!.find((entry) => entry.kind === 'appointment')!
    const fired = fireStaffFromTeam(world, staffId)
    const departure = fired.staffCareerHistoryByStaffId[staffId]!.find((entry) => entry.kind === 'departure')!
    expect(departure.date >= appointment.date).toBe(true)
  })

  it('uses the canonical head-coach career flow for an ACB free-agent coach', () => {
    const world = createAcbTestGame({ userTeamKey: 'caz' })
    const team = getUserTeam(world)!
    const coachId = Object.values(world.coaches).find((coach) => String(coach.id) === 'acb-free-agent-head-coach-1')!.id
    expect(world.coachEmploymentByCoachId[coachId]!.status).toBe('unemployed')

    const fired = fireCoachFromTeam(world, team.id)
    const opening = Object.values(fired.coachJobOpeningsById).find((item) => item.teamId === team.id && item.status === 'open')!
    const candidacy = identifyCoachCandidate(fired, { openingId: opening.id, coachId })
    const interviewed = completeCoachInterview(startCoachInterview(candidacy.world, candidacy.candidacyId), candidacy.candidacyId)
    const offer = createCoachJobOffer(interviewed, { candidacyId: candidacy.candidacyId })
    const hired = acceptCoachJobOffer(offer.world, offer.offerId)

    expect(hired.teams[team.id]!.coachId).toBe(coachId)
    expect(hired.coachEmploymentByCoachId[coachId]).toMatchObject({ status: 'employed', teamId: team.id })
    expect(Object.values(hired.teams).filter((item) => item.coachId === coachId)).toHaveLength(1)
    expect(Object.values(hired.teamStaffAssignmentsById).some((assignment) => assignment.role === 'headCoach')).toBe(false)
    const loaded = deserializeGameWorldV1(serializeGameWorldV1(hired, '2026-09-19T00:00:00.000Z'))
    expect(loaded.teams[team.id]!.coachId).toBe(coachId)
    expect(loaded.coachEmploymentByCoachId[coachId]).toEqual(hired.coachEmploymentByCoachId[coachId])
  })

  it('leaves the prototype staff fixture unchanged', () => {
    const prototype = createNewGame()
    expect(Object.values(prototype.teamStaffAssignmentsById).every((assignment) => ['assistantCoach', 'regionalScout', 'physiotherapist'].includes(assignment.role))).toBe(true)
    expect(Object.values(prototype.teamStaffAssignmentsById)).toHaveLength(Object.keys(prototype.staffPeopleById).length)
  })
})
