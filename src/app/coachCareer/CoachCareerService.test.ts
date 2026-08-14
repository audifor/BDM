import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { acceptCoachJobOffer, completeCoachInterview, createCoachJobOffer, fireCoachFromTeam, identifyCoachCandidate, runCoachHiringProcessForOpening, startCoachInterview } from './CoachCareerService'

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
  })

  it('uses deterministic AI ranking while leaving a user offer pending', () => {
    const base = createNewGame()
    const destination = Object.values(base.teams).find((team) => team.coachId !== base.userCoachId)!
    const fired = fireCoachFromTeam(base, destination.id)
    const opening = Object.values(fired.coachJobOpeningsById).find((item) => item.teamId === destination.id)!
    const ranked = runCoachHiringProcessForOpening(fired, opening.id)
    const again = runCoachHiringProcessForOpening(fired, opening.id)

    expect(ranked).toEqual(again)
    expect(Object.values(ranked.coachJobOffersById).every((offer) => offer.status === 'accepted' || offer.status === 'pending')).toBe(true)
  })
})
