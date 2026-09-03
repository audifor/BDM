import { describe, expect, it } from 'vitest'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { getRelationshipDimensions } from '@/domain/relationships'
import { updateGameWorld } from '@/domain/world'
import { progressStaffHumanState } from './StaffHumanStatePipeline'
import { appraiseStaffCareer } from './StaffCareerAutonomyEngine'

describe('StaffCareerAutonomy professional relationship appraisal', () => {
  it('uses only directed leadership professional facets; unrelated and legacy profiles stay neutral', () => {
    const base = progressStaffHumanState(createAcbTestGame())
    const context = Object.values(base.staffHumanContextsById)[0]!
    const human = base.staffHumanStatesByContextId[context.id]!
    const coachId = base.teams[context.teamId]!.coachId!
    const negative = { trust: -80, professionalRespect: -80, communicationQuality: -80, collaboration: 0, personalCloseness: 0, perceivedSupport: -80, reliability: 0, professionalAlignment: -80 }
    const leadership = updateGameWorld(base, { relationshipsByKey: { [`${context.staffId}->${coachId}`]: { sourceId: context.staffId, targetId: coachId, value: 0, dimensions: negative, events: [] } } })
    const unrelated = updateGameWorld(base, { relationshipsByKey: { [`${context.staffId}->${base.userCoachId}`]: { sourceId: context.staffId, targetId: base.userCoachId, value: -100, events: [] } } })
    expect(appraiseStaffCareer(leadership, context, human).belongingPressure).toBeGreaterThan(appraiseStaffCareer(base, context, human).belongingPressure)
    expect(appraiseStaffCareer(unrelated, context, human).belongingPressure).toBe(appraiseStaffCareer(base, context, human).belongingPressure)
    expect(getRelationshipDimensions(unrelated.relationshipsByKey[`${context.staffId}->${base.userCoachId}`]).trust).toBe(0)
  })
})
