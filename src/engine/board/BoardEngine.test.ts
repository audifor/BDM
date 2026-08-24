import { describe, expect, it } from 'vitest'
import { evaluateObjective, generateObjective } from './BoardEngine'

describe('BoardEngine',()=>{it('grades a top-four result contextually',()=>{const objective=generateObjective('team' as never,'season' as never,4,16);expect(evaluateObjective(objective,4,16)).toBe('met');expect(evaluateObjective(objective,5,16)).toBe('nearMiss');expect(evaluateObjective(objective,12,16)).toBe('severelyFailed')});it('recognizes survival overachievement without raising its baseline',()=>{const objective=generateObjective('team' as never,'season' as never,15,16);expect(objective.kind).toBe('avoidRelegation');expect(evaluateObjective(objective,6,16)).toBe('exceptional')})})
