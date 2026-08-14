import { createGameDate } from '@/domain/date'
import { generatePersonality } from '@/domain/personality'
import { applyMoraleEvent, createMoraleProfile, getMoraleBand } from './Morale'
import { describe, expect, it } from 'vitest'
describe('Morale',()=>{it('defaults, bands, personality reaction, clamps and idempotency are deterministic',()=>{const personality=generatePersonality('person');const profile=createMoraleProfile('person');const event={id:'e',personId:'person',gameDate:createGameDate(2032,10,1),source:'matchResult' as const,delta:-200,context:{result:'loss'}};const updated=applyMoraleEvent(profile,personality,event);expect(profile.value).toBe(50);expect(updated.value).toBe(0);expect(applyMoraleEvent(updated,personality,event)).toBe(updated);expect(getMoraleBand(81)).toBe('excellent');expect(generatePersonality('person')).toEqual(personality)})})
