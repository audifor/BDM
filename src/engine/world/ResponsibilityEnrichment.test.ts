import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { responsibilityDefinition, responsibilityIdForTeam } from '@/domain/responsibility'
import { updateGameWorld } from '@/domain/world'
import { ensureResponsibilityStructure } from './ResponsibilityEnrichment'

describe('free-agent default reachability configuration', () => {
  it('keeps new AI execution responsibilities vacant at their canonical default modes', () => {
    const world = createNewGame()
    for (const team of Object.values(world.teams)) {
      for (const kind of ['initiateNegotiationContact', 'submitPlayerContractOffer', 'executePlayerContractSigning'] as const) {
        expect(world.responsibilitiesById[responsibilityIdForTeam(team.id, kind)]).toMatchObject({
          teamId: team.id,
          kind,
          mode: responsibilityDefinition(kind).defaultMode,
        })
        expect(world.responsibilitiesById[responsibilityIdForTeam(team.id, kind)]?.holderStaffId).toBeUndefined()
      }
    }
  })

  it('keeps the default world free of invented professional club signing authority', () => {
    const world = createNewGame()
    expect(Object.values(world.governanceInstitutionsById)).toEqual([])
    expect(Object.values(world.governanceAppointmentsById)).toEqual([])
    expect(Object.values(world.governanceAuthorityGrantsById)).toEqual([])
    expect(Object.values(world.governanceDecisionParticipationGrantsById)).toEqual([])
  })

  it('backfills only missing responsibility rows using declared modes and is idempotent', () => {
    const world = createNewGame()
    const team = Object.values(world.teams)[0]!
    const missing = updateGameWorld(world, { responsibilities: Object.values(world.responsibilitiesById).filter((item) => item.teamId !== team.id) })
    const once = ensureResponsibilityStructure(missing)
    expect(ensureResponsibilityStructure(once)).toEqual(once)
    for (const kind of ['initiateNegotiationContact', 'submitPlayerContractOffer', 'executePlayerContractSigning'] as const) {
      expect(once.responsibilitiesById[responsibilityIdForTeam(team.id, kind)]?.mode).toBe(responsibilityDefinition(kind).defaultMode)
    }
  })
})
