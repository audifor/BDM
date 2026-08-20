import { describe,it,expect } from 'vitest'
import { createNewGame } from '@/app/game'
import { requestBoosterSupport } from './BoosterEngine'
describe('Boosters',()=>it('are deterministic NCAA actors whose support is resource-bound and funds collectives',()=>{const world=createNewGame(), booster=Object.values(world.boostersById)[0]!;expect(booster).toBeDefined();const collective=Object.values(world.collectivesById).find(c=>c.programTeamId===booster.programTeamId)!;const result=requestBoosterSupport(world,booster.id);expect(result.ok).toBe(true);if(!result.ok)return;expect(result.value.collectivesById[collective.id]!.resourcesRemaining).toBeGreaterThanOrEqual(collective.resourcesRemaining);expect(requestBoosterSupport(result.value,booster.id).ok).toBe(false)}))
