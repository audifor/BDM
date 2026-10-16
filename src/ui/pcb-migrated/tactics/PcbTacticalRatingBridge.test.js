import { describe, expect, it } from 'vitest'
import { tacticalAttributesFromPlayerTruth } from './PcbTacticalRatingBridge'
import { calcRoleSuitability, TACTICAL_ROLES_BY_POS, TACTICAL_DUTIES } from './PcbTacticalRoles'

function boardPlayer(ratings, pos='SG') {
  const data = tacticalAttributesFromPlayerTruth({basketball:{ratings}})
  return {data:{attributes:data,bio:{pos}},position:pos,rating:70}
}

describe('Canonical player truth to tactical role evaluation', () => {
  it('does not display a fabricated score when there are no canonical attributes', () => {
    const p=boardPlayer({})
    for (const role of TACTICAL_ROLES_BY_POS.SG) {
      expect(calcRoleSuitability(p,role,'SG','Apoyo')).toBeNull()
    }
  })
  it('uses real distinct ratings for scoring and defending even when overall is the same', () => {
    const sniper=boardPlayer({
      THREE_POINT_STATIC:92,THREE_POINT_PULLUP:88,MOVEMENT_SHOOTING:86,
      DEEP_SHOOTING:82,FREE_THROW:90,DECISION_MAKING:77,RIM_FINISHING:70,
      POINT_OF_ATTACK_DEFENSE:18,SHOT_CONTEST:20,HELP_DEFENSE:22,
      SCREEN_NAVIGATION_DEFENSE:25,LATERAL_DEFENSE:20,
    },'PG')
    const stopper=boardPlayer({
      THREE_POINT_STATIC:20,THREE_POINT_PULLUP:22,MOVEMENT_SHOOTING:24,
      DEEP_SHOOTING:20,FREE_THROW:34,DECISION_MAKING:75,RIM_FINISHING:35,
      POINT_OF_ATTACK_DEFENSE:93,SHOT_CONTEST:94,HELP_DEFENSE:86,
      SCREEN_NAVIGATION_DEFENSE:91,LATERAL_DEFENSE:87,
    },'PG')
    const shooterFit=calcRoleSuitability(sniper,'Francotirador','PG','Apoyo')
    const stopperFit=calcRoleSuitability(stopper,'Francotirador','PG','Apoyo')
    expect(shooterFit).toBeGreaterThan(stopperFit)
    expect(calcRoleSuitability(stopper,'Defensivo','PG','Defensa')).toBeGreaterThan(
      calcRoleSuitability(sniper,'Defensivo','PG','Defensa'),
    )
    expect(shooterFit).not.toBe(70)
  })
  it('only exposes the supported roles for the actual position and the three duties', () => {
    expect(TACTICAL_ROLES_BY_POS.C).toContain('Protector Aro')
    expect(TACTICAL_ROLES_BY_POS.PG).toContain('Creador P&R')
    expect(TACTICAL_DUTIES).toEqual(['Ataque','Apoyo','Defensa'])
  })
})
