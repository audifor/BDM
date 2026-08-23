import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { acceptCoachJobOffer, completeCoachInterview, createCoachJobOffer, fireCoachFromTeam, getEligibleCoachJobs, getOpenCoachJobs, identifyCoachCandidate, rankCoachCandidates, runCoachHiringProcessForOpening, startCoachInterview } from './CoachCareerService'

describe('Coach career application flow', () => {
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
