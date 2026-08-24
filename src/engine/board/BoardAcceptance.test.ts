import { describe, expect, it } from 'vitest'
import { createBoardState, getJobSecurity } from '@/domain/board'
import { BOARD_CONFIG, evaluateFiringRisk, evaluateObjective, evaluateRenewalRecommendation, generateObjective } from './BoardEngine'

const state=(confidence=60,patience=50,outcome:any='inProgress')=>createBoardState({teamId:'team' as never,coachId:'coach' as never,startedOn:'2032-01-01' as never,profile:{ambition:70,patience,stability:60,resultsFocus:70,developmentFocus:40,prestigeFocus:70},expectation:{summary:'Top 4',baselinePosition:4,seasonId:'season' as never},objectives:[{id:'objective',kind:'reachTopPosition',label:'Top 4',priority:'critical',horizon:'season',seasonId:'season' as never,targetPosition:4,outcome}],confidence,reasons:[],processedEventKeys:[]})
describe('Hito 065 acceptance',()=>{
 it('1 Newly Promoted',()=>expect(evaluateObjective(generateObjective('a' as never,'s' as never,15,16),7,16)).toBe('exceptional'))
 it('2 Disappointing Giant',()=>expect(evaluateObjective(generateObjective('a' as never,'s' as never,1,16),12,16)).toBe('severelyFailed'))
 it('3 Near Miss',()=>{const o=generateObjective('a' as never,'s' as never,4,16);expect(evaluateObjective(o,4,16)).toBe('met');expect(evaluateObjective(o,5,16)).toBe('nearMiss');expect(evaluateObjective(o,12,16)).toBe('severelyFailed')})
 it('4 Extraordinary Season',()=>expect(evaluateObjective(generateObjective('a' as never,'s' as never,15,16),3,16)).toBe('exceptional'))
 it('5 Patient Board',()=>expect(getJobSecurity(state(35,90))).toBe('underPressure'))
 it('6 Impatient Board',()=>expect(getJobSecurity(state(35,0))).toBe('atRisk'))
 it('7 Coach With History',()=>expect(getJobSecurity(state(35,90))).not.toBe(getJobSecurity(state(35,0))) )
 it('8 Contextual Relegation',()=>expect(BOARD_CONFIG.impacts.severelyFailed).toBeLessThan(BOARD_CONFIG.impacts.failed))
 it('9 Promotion',()=>expect(BOARD_CONFIG.impacts.exceptional).toBeGreaterThan(BOARD_CONFIG.impacts.met))
 it('10 Championship',()=>{expect(evaluateObjective(generateObjective('a' as never,'s' as never,1,16),1,16)).toBe('met');expect(evaluateObjective(generateObjective('a' as never,'s' as never,8,16),1,16)).toBe('exceptional')})
 it('11 Raised Expectations',()=>expect(evaluateObjective(generateObjective('a' as never,'s' as never,15,16),6,16)).toBe('exceptional'))
 it('12 Firing',()=>expect(evaluateFiringRisk(state(10,0,'severelyFailed'))).toBe(true))
 it('13 No False Firing',()=>expect(evaluateFiringRisk(state(55,90,'inProgress'))).toBe(false))
 it('14 Renewal',()=>{expect(evaluateRenewalRecommendation(state(85,60,'met'))).toBe('renew');expect(evaluateRenewalRecommendation(state(10,0,'severelyFailed'))).toBe('doNotRenew')})
 it('15 Persistence semantics',()=>{const a=state();expect(createBoardState({...a,processedEventKeys:['season','season']}).processedEventKeys).toEqual(['season'])})
})
