import { describe, expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { createGovernanceClubScenario, withIssuedGovernanceRequest } from './testFixtures'
import { buildClubGovernanceModel } from './BoardGovernanceReadModel'
import { respondToClubGovernanceRequest } from './ClubGovernanceRequestResponse'

describe('BS18-P0 canonical governance request responses', () => {
  it('records acknowledge -> accept on the same day, with deterministic order and Save V4 continuity', () => {
    const scenario = createGovernanceClubScenario()
    const { world, requestId } = withIssuedGovernanceRequest(scenario)
    const request = () => ({ teamId: scenario.teamId, requestId })

    const acknowledged = respondToClubGovernanceRequest(world, { ...request(), kind: 'ACKNOWLEDGED' })
    expect(acknowledged.status).toBe('APPLIED')
    expect(acknowledged.requestStatus).toBe('ACKNOWLEDGED')
    expect(acknowledged.world.governanceRequestsById[requestId]).toEqual(world.governanceRequestsById[requestId])
    expect(Object.values(acknowledged.world.governanceDecisionEventsById)).toEqual(Object.values(world.governanceDecisionEventsById))
    expect(respondToClubGovernanceRequest(acknowledged.world, { ...request(), kind: 'ACKNOWLEDGED' })).toMatchObject({
      status: 'BLOCKED', world: acknowledged.world, reasons: ['INVALID_REQUEST_TRANSITION'],
    })

    const accepted = respondToClubGovernanceRequest(acknowledged.world, { ...request(), kind: 'ACCEPTED' })
    expect(accepted.status).toBe('APPLIED')
    expect(buildClubGovernanceModel(accepted.world, scenario.teamId).requests[0]).toMatchObject({
      status: 'ACCEPTED', addressedToUser: true, responseCommandAvailable: false,
    })
    const events = Object.values(accepted.world.governanceRequestEventsById).filter((event) => event.requestId === requestId)
    expect(events).toHaveLength(3)
    expect(events.map((event) => event.kind).sort()).toEqual(['ACCEPTED', 'ACKNOWLEDGED', 'ISSUED'])
    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(accepted.world, '2032-01-02T00:00:00.000Z'))
    expect(buildClubGovernanceModel(reloaded, scenario.teamId)).toEqual(buildClubGovernanceModel(accepted.world, scenario.teamId))
    expect(respondToClubGovernanceRequest(reloaded, { ...request(), kind: 'DECLINED' })).toMatchObject({
      status: 'BLOCKED', world: reloaded, reasons: ['REQUEST_ALREADY_RESOLVED'],
    })
  })

  it('declines a request once and removes resolved attention', () => {
    const scenario = createGovernanceClubScenario()
    const { world, requestId } = withIssuedGovernanceRequest(scenario)
    const result = respondToClubGovernanceRequest(world, { teamId: scenario.teamId, requestId, kind: 'DECLINED' })
    expect(result.status).toBe('APPLIED')
    expect(buildClubGovernanceModel(result.world, scenario.teamId).attentionRequests).toEqual([])
    expect(respondToClubGovernanceRequest(result.world, { teamId: scenario.teamId, requestId, kind: 'DECLINED' })).toMatchObject({
      status: 'BLOCKED', world: result.world, reasons: ['REQUEST_ALREADY_RESOLVED'],
    })
    expect(Object.keys(result.world.governanceRequestEventsById)).toHaveLength(Object.keys(world.governanceRequestEventsById).length + 1)
  })

  it('rejects a foreign club, wrong recipient, missing request and unknown team without mutation', () => {
    const scenario = createGovernanceClubScenario()
    const { world, requestId } = withIssuedGovernanceRequest(scenario)
    const input = { teamId: scenario.teamId, requestId, kind: 'ACCEPTED' as const }
    const otherTeam = Object.values(world.teams).find((team) => team.id !== scenario.teamId)!
    expect(respondToClubGovernanceRequest(world, { ...input, teamId: otherTeam.id })).toMatchObject({
      status: 'BLOCKED', world, reasons: ['NOT_USER_TEAM'],
    })
    expect(respondToClubGovernanceRequest(world, { ...input, teamId: 'missing-team' as never })).toMatchObject({
      status: 'BLOCKED', world, reasons: ['UNKNOWN_TEAM'],
    })
    expect(respondToClubGovernanceRequest(world, { ...input, requestId: 'missing' })).toMatchObject({
      status: 'BLOCKED', world, reasons: ['REQUEST_NOT_FOUND'],
    })
    const changed = updateGameWorld(world, { governanceRequests: [{
      ...world.governanceRequestsById[requestId]!,
      recipient: { kind: 'BODY' as const, bodyId: scenario.boardBodyId },
    }] })
    expect(buildClubGovernanceModel(changed, scenario.teamId).requests[0]).toMatchObject({
      addressedToUser: false, responseCommandAvailable: false,
    })
    expect(respondToClubGovernanceRequest(changed, input)).toMatchObject({
      status: 'BLOCKED', world: changed, reasons: ['NOT_REQUEST_RECIPIENT'],
    })
  })

  it('does not backdate responses before a request event', () => {
    const scenario = createGovernanceClubScenario()
    const { world, requestId } = withIssuedGovernanceRequest(scenario)
    const later = updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) })
    const advanced = respondToClubGovernanceRequest(later, { teamId: scenario.teamId, requestId, kind: 'ACKNOWLEDGED' })
    expect(advanced.status).toBe('APPLIED')
    const events = Object.values(advanced.world.governanceRequestEventsById).filter((event) => event.requestId === requestId)
    expect(events.some((event) => event.kind === 'ACKNOWLEDGED' && event.effectiveOn === later.currentDate)).toBe(true)
  })
})
