import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { getEligiblePlayersForCompetition } from '@/engine/eligibility'
import { assignAcademicSupport, ensureNcaaAcademics, evaluateAcademicEligibility, initializeAcademicProfile, resolveAcademicTerm } from './AcademicEngine'

describe('Academic eligibility',()=>{
  it('batch initialization matches individual initialization and is idempotent', () => {
    const initial = updateGameWorld(createNewGame(), { academicProfiles: [], academicRulesByEcosystemId: {} })
    const started = performance.now()
    const batched = ensureNcaaAcademics(initial)
    const batchMs = performance.now() - started
    const sequentialStart = performance.now()
    let sequential = initial
    for (const competition of Object.values(initial.competitions)) {
      if (initial.ecosystems[competition.ecosystemId]?.kind !== 'ncaaLike') continue
      for (const teamId of competition.participantTeamIds) for (const playerId of initial.teams[teamId]!.rosterPlayerIds) {
        sequential = initializeAcademicProfile(sequential, playerId, teamId, competition.ecosystemId)
      }
    }
    process.stdout.write(`NCAA academic initialization (168 profiles) ms: batch=${Math.round(batchMs)} sequential=${Math.round(performance.now() - sequentialStart)}\n`)
    expect(batched.academicProfilesById).toEqual(sequential.academicProfilesById)
    expect(batched.academicRulesByEcosystemId).toEqual(sequential.academicRulesByEcosystemId)
    expect(ensureNcaaAcademics(batched)).toBe(batched)
  })
  it('initializes NCAA-only profiles deterministically and applies term restrictions idempotently',()=>{const world=createNewGame();const season=Object.values(world.seasons).find(s=>world.ecosystems[world.competitions[s.competitionId]!.ecosystemId]!.kind==='ncaaLike')!,game=Object.values(world.games).find(g=>g.seasonId===season.id)!,playerId=world.teams[game.homeTeamId]!.rosterPlayerIds[0]!,profile=Object.values(world.academicProfilesById).find(p=>p.playerId===playerId)!;expect(Object.values(world.academicProfilesById)).toHaveLength(168);for(const ecosystem of Object.values(world.ecosystems).filter(e=>e.kind==='ncaaLike'))expect(Object.values(world.academicProfilesById).filter(p=>p.ecosystemId===ecosystem.id)).toHaveLength(84);const failing=updateGameWorld(world,{academicProfiles:Object.values(world.academicProfilesById).map(p=>p.id===profile.id?{...p,performance:20,progress:20}:p)}),resolved=resolveAcademicTerm(failing,'term-a');expect(evaluateAcademicEligibility(resolved,playerId).academicallyEligible).toBe(false);expect(getEligiblePlayersForCompetition(resolved,game.homeTeamId,game.competitionId,season.id,game.date)).not.toContain(playerId);expect(resolveAcademicTerm(resolved,'term-a')).toEqual(resolved)})
  it('consumes bounded support through one shared operation',()=>{const world=createNewGame(),profile=Object.values(world.academicProfilesById)[0]!,first=assignAcademicSupport(world,profile.playerId,'term-b','intensive');expect(first.ok).toBe(true);if(first.ok)expect(Object.values(first.value.academicSupportPlansById)).toHaveLength(1)})
})
