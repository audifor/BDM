import { describe, expect, it } from 'vitest'

import { createDefaultCoachReputationProfile } from '@/domain/coachReputation'
import { createGameDate } from '@/domain/date'
import { coachIdFromString, teamIdFromString } from '@/domain/ids'

import {
  appointCoachToTeam, coachJobCandidacyIdFromString, coachJobOfferIdFromString, coachJobOpeningIdFromString, createCoachEmployment, decideCoachJobOffer, evaluateCoachJobEligibility, fireCoach, leaveForAnotherJob, transitionCoachInterview, transitionCoachJobCandidacy,
} from './CoachCareer'

const coachId = coachIdFromString('coach-1')
const teamA = teamIdFromString('team-a')
const teamB = teamIdFromString('team-b')
const date = createGameDate(2032, 10, 1)
const unemployed = createCoachEmployment({ status: 'unemployed' })
const employed = createCoachEmployment({ status: 'employed', teamId: teamA, startedOn: date })
const opening = (status: 'open' | 'filled' | 'closed' = 'open', minimum?: number) => ({ id: coachJobOpeningIdFromString(`opening-${status}-${minimum ?? 'none'}`), teamId: teamB, status, createdOn: date, ...(minimum === undefined ? {} : { reputationRequirement: { minimum: { competitive: minimum } } }) })

describe('Coach career domain foundation', () => {
  it('validates employed and unemployed snapshots', () => {
    expect(employed).toEqual({ status: 'employed', teamId: teamA, startedOn: date })
    expect(unemployed).toEqual({ status: 'unemployed' })
    expect(() => createCoachEmployment({ status: 'employed' })).toThrow(RangeError)
    expect(() => createCoachEmployment({ status: 'unemployed', teamId: teamA })).toThrow(RangeError)
  })

  it('evaluates open reputation requirements equally for employed and unemployed coaches', () => {
    const reputation = createDefaultCoachReputationProfile()
    expect(evaluateCoachJobEligibility(employed, reputation, opening('open', 200))).toEqual({ eligible: true, reasons: [] })
    expect(evaluateCoachJobEligibility(unemployed, reputation, opening('open', 201))).toEqual({ eligible: false, reasons: [{ reason: 'reputationRequirementNotMet', unmet: [{ dimension: 'competitive', required: 201, actual: 200 }] }] })
    expect(evaluateCoachJobEligibility(employed, reputation, opening('filled'))).toEqual({ eligible: false, reasons: [{ reason: 'jobNotOpen' }] })
    expect(evaluateCoachJobEligibility(unemployed, reputation, opening('closed'))).toEqual({ eligible: false, reasons: [{ reason: 'jobNotOpen' }] })
  })

  it('transitions candidacies only through the V1 process and leaves inputs intact', () => {
    const candidacy = { id: coachJobCandidacyIdFromString('candidacy-1'), jobOpeningId: opening().id, coachId, status: 'identified' as const, createdOn: date }
    const interviewing = transitionCoachJobCandidacy(candidacy, 'interviewing')
    expect(interviewing).toMatchObject({ ok: true, candidacy: { status: 'interviewing' } })
    if (!interviewing.ok) return
    const offered = transitionCoachJobCandidacy(interviewing.candidacy, 'offered')
    expect(offered).toMatchObject({ ok: true, candidacy: { status: 'offered' } })
    if (!offered.ok) return
    expect(transitionCoachJobCandidacy(offered.candidacy, 'hired')).toMatchObject({ ok: true, candidacy: { status: 'hired' } })
    expect(transitionCoachJobCandidacy({ ...candidacy, status: 'rejected' }, 'interviewing')).toEqual({ ok: false, reason: 'invalidCandidacyTransition' })
    expect(candidacy.status).toBe('identified')
  })

  it('completes interviews and makes only pending offer decisions', () => {
    expect(transitionCoachInterview({ candidacyId: coachJobCandidacyIdFromString('candidacy-interview'), status: 'scheduled' }, 'completed')).toMatchObject({ ok: true, interview: { status: 'completed' } })
    const offer = { id: coachJobOfferIdFromString('offer-1'), jobOpeningId: opening().id, coachId, teamId: teamB, createdOn: date, status: 'pending' as const }
    for (const decision of ['accepted', 'declined', 'withdrawn'] as const) expect(decideCoachJobOffer(offer, decision)).toMatchObject({ ok: true, offer: { status: decision } })
    expect(decideCoachJobOffer({ ...offer, status: 'accepted' }, 'declined')).toEqual({ ok: false, reason: 'invalidOfferTransition' })
    expect(offer.status).toBe('pending')
  })

  it('records append-only appointments, firing and a move to another job without touching reputation', () => {
    const initial = appointCoachToTeam({ employment: unemployed, history: [], coachId, teamId: teamA, date, reason: 'initialAppointment' })
    expect(initial).toMatchObject({ ok: true, employment: { status: 'employed', teamId: teamA }, history: [{ kind: 'appointment', reason: 'initialAppointment' }] })
    if (!initial.ok) return
    const fired = fireCoach({ employment: initial.employment, history: initial.history, decision: { coachId, teamId: teamA, date, reason: 'performance' } })
    expect(fired).toMatchObject({ ok: true, employment: { status: 'unemployed' }, history: [{ kind: 'appointment' }, { kind: 'departure', reason: 'fired' }] })
    if (!fired.ok) return
    const hired = appointCoachToTeam({ employment: fired.employment, history: fired.history, coachId, teamId: teamB, date })
    expect(hired).toMatchObject({ ok: true, history: [{ kind: 'appointment' }, { kind: 'departure', reason: 'fired' }, { kind: 'appointment', teamId: teamB, reason: 'hired' }] })
    const leaving = leaveForAnotherJob({ employment: employed, history: [], coachId, date })
    expect(leaving).toMatchObject({ ok: true, employment: { status: 'unemployed' }, history: [{ kind: 'departure', teamId: teamA, reason: 'acceptedOtherJob' }] })
    expect(appointCoachToTeam({ employment: employed, history: [], coachId, teamId: teamA, date })).toEqual({ ok: false, reason: 'alreadyEmployedByTeam' })
    expect(createDefaultCoachReputationProfile()).toEqual({ values: { competitive: 200, development: 200, professional: 200, publicStanding: 200 }, events: [] })
  })
})
