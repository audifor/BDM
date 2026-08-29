import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { createBoardState } from '@/domain/board'
import { acceptCoachJobOffer, applyBoardFiringRecommendation, applyUserCoachForJob, completeCoachInterview, createCoachJobOffer, fireCoachFromTeam, getEligibleCoachJobs, getOpenCoachJobs, identifyCoachCandidate, rankCoachCandidates, runCoachHiringProcessForOpening, startCoachInterview } from './CoachCareerService'

describe('Coach career application flow', () => {
  it('materializes a user application as a pending offer that can change clubs', () => { const base=createNewGame(); const opening=Object.values(base.coachJobOpeningsById).find(item=>item.status==='open')!; const applied=applyUserCoachForJob(base,opening.id); const offer=Object.values(applied.world.coachJobOffersById).find(item=>item.coachId===base.userCoachId&&item.status==='pending')!; const accepted=acceptCoachJobOffer(applied.world,offer.id); expect(accepted.teams[opening.teamId]!.coachId).toBe(base.userCoachId); expect(accepted.coachJobOffersById[offer.id]!.status).toBe('accepted'); expect(Object.keys(accepted.memoriesById).length).toBeGreaterThan(0) })
  it('uses the Board recommendation rather than a parallel firing transition', () => { const base=createNewGame();const team=Object.values(base.teams).find((item)=>item.coachId===base.userCoachId)!;const season=Object.values(base.seasons).find((item)=>item.competitionId&&base.competitions[item.competitionId]!.participantTeamIds.includes(team.id))!;const state=createBoardState({teamId:team.id,coachId:base.userCoachId,startedOn:base.currentDate,profile:{ambition:90,patience:0,stability:30,resultsFocus:90,developmentFocus:20,prestigeFocus:90},expectation:{summary:'Win',baselinePosition:1,seasonId:season.id},objectives:[{id:'title',kind:'winChampionship',label:'Win',priority:'critical',horizon:'season',seasonId:season.id,outcome:'severelyFailed'}],confidence:10,reasons:[],processedEventKeys:[]});const fired=applyBoardFiringRecommendation(updateGameWorld(base,{boardStatesByTeamId:{[team.id]:state}}),team.id);expect(fired.teams[team.id]!.coachId).toBeUndefined();expect(fired.coachEmploymentByCoachId[base.userCoachId]!.status).toBe('unemployed') })
  it('fires, interviews, offers and hires an unemployed coach through the canonical flow', () => {
    const base = createNewGame()
    const source = Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!
    const fired = fireCoachFromTeam(base, source.id)
    const opening = Object.values(fired.coachJobOpeningsById).find((item) => item.teamId === source.id && item.status === 'open')!
    const candidate = identifyCoachCandidate(fired, { openingId: opening.id, coachId: base.userCoachId })
    const interviewed = completeCoachInterview(startCoachInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
    const offer = createCoachJobOffer(interviewed, { candidacyId: candidate.candidacyId })
    const hired = acceptCoachJobOffer(offer.world, offer.offerId)

    expect(hired.teams[source.id]!.coachId).toBe(base.userCoachId)
    expect(hired.coachEmploymentByCoachId[base.userCoachId]).toMatchObject({ status: 'employed', teamId: source.id, startedOn: base.currentDate })
    expect(hired.coachJobOpeningsById[opening.id]!.status).toBe('filled')
    expect(hired.coachJobOffersById[offer.offerId as keyof typeof hired.coachJobOffersById]!.status).toBe('accepted')
    expect(Object.values(hired.memoriesById)).toEqual(expect.arrayContaining([expect.objectContaining({ owner: { kind: 'player', id: source.rosterPlayerIds[0] }, type: 'opportunity', entityRefs: expect.arrayContaining([expect.objectContaining({ kind: 'coach', id: base.userCoachId })]) })]))
  })

  it('uses deterministic AI ranking while leaving a user offer pending', () => {
    const base = createNewGame()
    const destination = Object.values(base.teams).find((team) => team.coachId !== undefined && team.coachId !== base.userCoachId)!
    const fired = fireCoachFromTeam(base, destination.id)
    const opening = Object.values(fired.coachJobOpeningsById).find((item) => item.teamId === destination.id)!
    const ranked = runCoachHiringProcessForOpening(fired, opening.id)
    const again = runCoachHiringProcessForOpening(fired, opening.id)

    expect(ranked).toEqual(again)
    expect(Object.values(ranked.coachJobOffersById).every((offer) => offer.status === 'accepted' || offer.status === 'pending')).toBe(true)
  })

  it('scopes global vacancies by ecosystem identity and lets user and AI compete under the same rules', () => {
    const base = createNewGame()
    const men = Object.values(base.teams).find((team) => team.gender === 'male' && team.coachId !== undefined && team.coachId !== base.userCoachId)!
    const women = Object.values(base.teams).find((team) => team.gender === 'female' && team.coachId !== undefined)!
    const dated = updateGameWorld(base, { currentDate: '2032-10-08' as never })
    const withMen = fireCoachFromTeam(dated, men.id)
    const world = fireCoachFromTeam(withMen, women.id)
    const jobs = getOpenCoachJobs(world)
    expect(new Set(jobs.map((job) => job.sportsCategory))).toEqual(new Set(['men', 'women']))
    expect(new Set(jobs.map((job) => job.ecosystemId)).size).toBeGreaterThanOrEqual(2)
    const opening = jobs.find((job) => job.teamId === women.id)!
    expect(getEligibleCoachJobs(world, base.userCoachId).find((job) => job.opening.id === opening.id)!.eligibility.eligible).toBe(true)
    const user = identifyCoachCandidate(world, { openingId: opening.id, coachId: base.userCoachId })
    const ai = Object.values(world.coaches).find((coach) => coach.id !== base.userCoachId)!
    const withAi = identifyCoachCandidate(user.world, { openingId: opening.id, coachId: ai.id })
    expect(rankCoachCandidates(withAi.world, opening.id)).toEqual(rankCoachCandidates(withAi.world, opening.id))
  })
})
