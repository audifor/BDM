import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { coachJobCandidacyIdFromString, coachJobOfferIdFromString, coachJobOpeningIdFromString } from '@/domain/coachCareer'
import { getCoachCareerHistory, getCoachEmployment } from '@/domain/world'
import { advanceDay } from '@/engine/calendar'

import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'

const savedAt = '2032-10-01T12:00:00.000Z'

describe('Coach career persistence', () => {
  it('initializes employment and initial appointment history for every coach', () => {
    const world = createNewGame()
    for (const coach of Object.values(world.coaches)) {
      const assignedTeam = Object.values(world.teams).find((team) => team.coachId === coach.id)
      const startedOn = assignedTeam === undefined ? undefined : Object.values(world.seasons).filter((season) => world.competitions[season.competitionId]!.gender === assignedTeam.gender).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]!.startDate
      expect(getCoachEmployment(world, coach.id)).toEqual(assignedTeam === undefined ? { status: 'unemployed' } : { status: 'employed', teamId: assignedTeam.id, startedOn })
      expect(getCoachCareerHistory(world, coach.id)).toEqual(assignedTeam === undefined ? [] : [{ kind: 'appointment', coachId: coach.id, teamId: assignedTeam.id, date: startedOn, reason: 'initialAppointment' }])
    }
    expect(world.coachJobOpeningsById).toEqual({})
    expect(world.coachJobCandidaciesById).toEqual({})
    expect(world.coachInterviewsByCandidacyId).toEqual({})
    expect(world.coachJobOffersById).toEqual({})
  })

  it('round-trips history and future career collections and preserves them when advancing day', () => {
    const base = createNewGame()
    const teamId = Object.keys(base.teams)[0] as keyof typeof base.teams
    const coachId = base.userCoachId
    const openingId = coachJobOpeningIdFromString('opening:1')
    const candidacyId = coachJobCandidacyIdFromString('candidacy:1')
    const offerId = coachJobOfferIdFromString('offer:1')
    const world = { ...base, coachCareerHistoryByCoachId: { ...base.coachCareerHistoryByCoachId, [coachId]: [...base.coachCareerHistoryByCoachId[coachId]!, { kind: 'departure' as const, coachId, teamId, date: base.currentDate, reason: 'fired' as const }] }, coachJobOpeningsById: { [openingId]: { id: openingId, teamId, status: 'open' as const, createdOn: base.currentDate } }, coachJobCandidaciesById: { [candidacyId]: { id: candidacyId, jobOpeningId: openingId, coachId, status: 'identified' as const, createdOn: base.currentDate } }, coachInterviewsByCandidacyId: { [candidacyId]: { candidacyId, status: 'scheduled' as const } }, coachJobOffersById: { [offerId]: { id: offerId, jobOpeningId: openingId, coachId, teamId, createdOn: base.currentDate, status: 'pending' as const } } }
    const loaded = deserializeGameWorldV1(serializeGameWorldV1(world, savedAt))

    expect(loaded.coachCareerHistoryByCoachId).toEqual(world.coachCareerHistoryByCoachId)
    expect(loaded.coachJobOffersById).toEqual(world.coachJobOffersById)
    expect(advanceDay(loaded).coachJobCandidaciesById).toEqual(world.coachJobCandidaciesById)
  })

  it('enriches legacy saves from their current date and rejects contradictory employment', () => {
    const base = createNewGame()
    const saved = serializeGameWorldV1(base, savedAt)
    const legacyPayload = { ...saved.payload }
    delete (legacyPayload as { coachEmploymentByCoachId?: unknown }).coachEmploymentByCoachId
    delete (legacyPayload as { coachCareerHistoryByCoachId?: unknown }).coachCareerHistoryByCoachId
    delete (legacyPayload as { coachJobOpenings?: unknown }).coachJobOpenings
    delete (legacyPayload as { coachJobCandidacies?: unknown }).coachJobCandidacies
    delete (legacyPayload as { coachInterviews?: unknown }).coachInterviews
    delete (legacyPayload as { coachJobOffers?: unknown }).coachJobOffers
    const enriched = deserializeGameWorldV1({ ...saved, payload: legacyPayload })
    expect(deserializeGameWorldV1(serializeGameWorldV1(enriched, savedAt)).coachCareerHistoryByCoachId).toEqual(enriched.coachCareerHistoryByCoachId)

    const assigned = Object.values(base.teams).find((team) => team.coachId !== undefined)!
    const contradictory = serializeGameWorldV1(base, savedAt)
    const employment = contradictory.payload.coachEmploymentByCoachId!.map((entry) => entry.coachId === assigned.coachId ? { ...entry, profile: { status: 'unemployed' } } : entry)
    expect(() => deserializeGameWorldV1({ ...contradictory, payload: { ...contradictory.payload, coachEmploymentByCoachId: employment } })).toThrow('employment does not match')
  })
})
