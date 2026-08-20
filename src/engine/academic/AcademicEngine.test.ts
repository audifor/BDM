import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { getEligiblePlayersForCompetition } from '@/engine/eligibility'
import { assignAcademicSupport, evaluateAcademicEligibility, resolveAcademicTerm } from './AcademicEngine'

describe('Academic eligibility',()=>{
  it('initializes NCAA-only profiles deterministically and applies term restrictions idempotently',()=>{const world=createNewGame();const season=Object.values(world.seasons).find(s=>world.ecosystems[world.competitions[s.competitionId]!.ecosystemId]!.kind==='ncaaLike')!,game=Object.values(world.games).find(g=>g.seasonId===season.id)!,playerId=world.teams[game.homeTeamId]!.rosterPlayerIds[0]!,profile=Object.values(world.academicProfilesById).find(p=>p.playerId===playerId)!;expect(Object.values(world.academicProfilesById)).toHaveLength(168);for(const ecosystem of Object.values(world.ecosystems).filter(e=>e.kind==='ncaaLike'))expect(Object.values(world.academicProfilesById).filter(p=>p.ecosystemId===ecosystem.id)).toHaveLength(84);const failing=updateGameWorld(world,{academicProfiles:Object.values(world.academicProfilesById).map(p=>p.id===profile.id?{...p,performance:20,progress:20}:p)}),resolved=resolveAcademicTerm(failing,'term-a');expect(evaluateAcademicEligibility(resolved,playerId).academicallyEligible).toBe(false);expect(getEligiblePlayersForCompetition(resolved,game.homeTeamId,game.competitionId,season.id,game.date)).not.toContain(playerId);expect(resolveAcademicTerm(resolved,'term-a')).toEqual(resolved)})
  it('consumes bounded support through one shared operation',()=>{const world=createNewGame(),profile=Object.values(world.academicProfilesById)[0]!,first=assignAcademicSupport(world,profile.playerId,'term-b','intensive');expect(first.ok).toBe(true);if(first.ok)expect(Object.values(first.value.academicSupportPlansById)).toHaveLength(1)})
})
