import { describe, expect, it } from 'vitest'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { createStaffJobOpeningForTeam } from '@/app/staffCareer'
import { updateGameWorld } from '@/domain/world'
import { progressStaffHumanState } from '@/engine/staff/StaffHumanStatePipeline'
import { progressStaffAutonomousResignations, progressStaffCareerMarketAgency } from './StaffCareerAutonomyService'

describe('Staff career market agency', () => {
  it('creates one provenance-marked candidacy for the best real external opening', () => {
    const base = progressStaffHumanState(createAcbTestGame())
    const [staffId, employment] = Object.entries(base.staffEmploymentByStaffId).find(([, item]) => item.status === 'employed')!
    const context = Object.values(base.staffHumanContextsById).find((item) => item.staffId === staffId)!
    const destination = Object.values(base.teams).find((team) => team.id !== employment.teamId)!
    const roleId = employment.roleId!
    const opened = createStaffJobOpeningForTeam(base, { teamId: destination.id, roleId }).world
    const primed = updateGameWorld(opened, { staffCareerAutonomyStates: [{ contextId: context.id, staffId: context.staffId, teamId: context.teamId, outlook: 'RESTLESS', primaryIntent: 'EXPLORE_MARKET', intensity: 80, intentSince: opened.currentDate, lastEvaluatedOn: opened.currentDate }] })
    const result = progressStaffCareerMarketAgency(primed)
    const candidacy = Object.values(result.staffJobCandidaciesById).find((item) => item.staffId === staffId)
    expect(candidacy).toMatchObject({ jobOpeningId: Object.values(result.staffJobOpeningsById).find((item) => item.teamId === destination.id && item.roleId === roleId)!.id, origin: 'staffApplied' })
  })

  it('does not invent a candidacy without a real opening', () => {
    const base = progressStaffHumanState(createAcbTestGame())
    const [staffId] = Object.entries(base.staffEmploymentByStaffId).find(([, item]) => item.status === 'employed')!
    const context = Object.values(base.staffHumanContextsById).find((item) => item.staffId === staffId)!
    const primed = updateGameWorld(base, { staffCareerAutonomyStates: [{ contextId: context.id, staffId: context.staffId, teamId: context.teamId, outlook: 'EXIT_MINDED', primaryIntent: 'EXPLORE_MARKET', intensity: 95, intentSince: base.currentDate, lastEvaluatedOn: base.currentDate }] })
    expect(progressStaffCareerMarketAgency(primed).staffJobCandidaciesById).toEqual({})
  })

  it('allows severe persistent EXIT_NOW intent to resign after an ignored release-request grace period', () => {
    const base = progressStaffHumanState(createAcbTestGame())
    const [staffId, employment] = Object.entries(base.staffEmploymentByStaffId).find(([, item]) => item.status === 'employed')!
    const context = Object.values(base.staffHumanContextsById).find((item) => item.staffId === staffId)!
    const primed = updateGameWorld(base, {
      staffCareerAutonomyStates: [{ contextId: context.id, staffId: context.staffId, teamId: context.teamId, outlook: 'EXIT_MINDED', primaryIntent: 'EXIT_NOW', intensity: 100, intentSince: '2020-01-01' as never, lastEvaluatedOn: base.currentDate }],
      staffCareerRequests: [{ id: 'release-request', contextId: context.id, staffId: context.staffId, teamId: context.teamId, kind: 'RELEASE', createdOn: '2020-01-01' as never, status: 'OPEN' }],
    })
    expect(progressStaffAutonomousResignations(primed).staffEmploymentByStaffId[staffId as never]).toMatchObject({ status: 'unemployed' })
    expect(employment.teamId).toBe(context.teamId)
  })
})
