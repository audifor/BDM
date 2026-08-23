import type { CoachReputationProfile, CoachReputationRequirement, CoachReputationRequirementFailure } from '@/domain/coachReputation'
import { evaluateCoachReputationRequirement } from '@/domain/coachReputation'
import type { GameDate } from '@/domain/date'
import type { CoachId, EcosystemId, TeamId } from '@/domain/ids'
import type { SportsCategory } from '@/domain/primitives'

declare const coachCareerIdBrand: unique symbol
type CoachCareerId<Kind extends string> = string & { readonly [coachCareerIdBrand]: Kind }
export type CoachJobOpeningId = CoachCareerId<'CoachJobOpeningId'>
export type CoachJobCandidacyId = CoachCareerId<'CoachJobCandidacyId'>
export type CoachJobOfferId = CoachCareerId<'CoachJobOfferId'>

export const coachJobOpeningIdFromString = (value: string): CoachJobOpeningId => careerId(value, 'Coach job opening ID')
export const coachJobCandidacyIdFromString = (value: string): CoachJobCandidacyId => careerId(value, 'Coach job candidacy ID')
export const coachJobOfferIdFromString = (value: string): CoachJobOfferId => careerId(value, 'Coach job offer ID')

export type CoachEmploymentStatus = 'employed' | 'unemployed'
export interface CoachEmployment { readonly status: CoachEmploymentStatus; readonly teamId?: TeamId; readonly startedOn?: GameDate }
export type CoachAppointmentReason = 'initialAppointment' | 'hired'
export type CoachDepartureReason = 'fired' | 'acceptedOtherJob'
export interface CoachCareerAppointmentEntry { readonly kind: 'appointment'; readonly coachId: CoachId; readonly teamId: TeamId; readonly date: GameDate; readonly reason: CoachAppointmentReason }
export interface CoachCareerDepartureEntry { readonly kind: 'departure'; readonly coachId: CoachId; readonly teamId: TeamId; readonly date: GameDate; readonly reason: CoachDepartureReason }
export type CoachCareerHistoryEntry = CoachCareerAppointmentEntry | CoachCareerDepartureEntry

export type CoachJobOpeningStatus = 'open' | 'filled' | 'closed'
export interface CoachJobFitWeights { readonly competitive: number; readonly development: number; readonly professional: number; readonly publicStanding: number }
export interface CoachJobOpening { readonly id: CoachJobOpeningId; readonly teamId: TeamId; readonly ecosystemId?: EcosystemId; readonly sportsCategory?: SportsCategory; readonly role?: 'headCoach'; readonly status: CoachJobOpeningStatus; readonly createdOn: GameDate; readonly reputationRequirement?: CoachReputationRequirement; readonly fitWeights?: CoachJobFitWeights }
export type CoachJobEligibilityFailureReason = 'jobNotOpen' | 'reputationRequirementNotMet'
export interface CoachJobEligibilityFailure { readonly reason: CoachJobEligibilityFailureReason; readonly unmet?: readonly CoachReputationRequirementFailure[] }
export interface CoachJobEligibilityResult { readonly eligible: boolean; readonly reasons: readonly CoachJobEligibilityFailure[] }

export type CoachJobCandidacyStatus = 'identified' | 'interviewing' | 'rejected' | 'offered' | 'withdrawn' | 'hired'
export interface CoachJobCandidacy { readonly id: CoachJobCandidacyId; readonly jobOpeningId: CoachJobOpeningId; readonly coachId: CoachId; readonly status: CoachJobCandidacyStatus; readonly createdOn: GameDate }
export type CoachInterviewStatus = 'scheduled' | 'completed'
export interface CoachInterview { readonly candidacyId: CoachJobCandidacyId; readonly status: CoachInterviewStatus }
export type CoachJobOfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn'
export interface CoachJobOffer { readonly id: CoachJobOfferId; readonly jobOpeningId: CoachJobOpeningId; readonly coachId: CoachId; readonly teamId: TeamId; readonly annualSalary?: number; readonly createdOn: GameDate; readonly status: CoachJobOfferStatus }
export type CoachFiringReason = 'performance'
export interface CoachFiringDecision { readonly coachId: CoachId; readonly teamId: TeamId; readonly date: GameDate; readonly reason: CoachFiringReason }

export type CoachCareerFailureReason = 'invalidEmploymentState' | 'alreadyEmployedByTeam' | 'invalidCandidacyTransition' | 'invalidInterviewTransition' | 'invalidOfferTransition'
export type CoachCareerTransitionResult = { readonly ok: true; readonly employment: CoachEmployment; readonly history: readonly CoachCareerHistoryEntry[] } | { readonly ok: false; readonly reason: CoachCareerFailureReason }
export type CoachCandidacyTransitionResult = { readonly ok: true; readonly candidacy: CoachJobCandidacy } | { readonly ok: false; readonly reason: 'invalidCandidacyTransition' }
export type CoachInterviewTransitionResult = { readonly ok: true; readonly interview: CoachInterview } | { readonly ok: false; readonly reason: 'invalidInterviewTransition' }
export type CoachOfferDecisionResult = { readonly ok: true; readonly offer: CoachJobOffer } | { readonly ok: false; readonly reason: 'invalidOfferTransition' }

export function createCoachEmployment(employment: CoachEmployment): CoachEmployment {
  if (employment.status === 'employed') {
    if (employment.teamId === undefined) throw new RangeError('Employed Coach requires a Team')
    return { status: 'employed', teamId: employment.teamId, ...(employment.startedOn === undefined ? {} : { startedOn: employment.startedOn }) }
  }
  if (employment.status !== 'unemployed' || employment.teamId !== undefined || employment.startedOn !== undefined) throw new RangeError('Unemployed Coach cannot have Team or start date')
  return { status: 'unemployed' }
}

export function createCoachJobOpening(opening: CoachJobOpening): CoachJobOpening {
  const fitWeights = opening.fitWeights === undefined ? undefined : { ...opening.fitWeights }
  if (fitWeights !== undefined && Object.values(fitWeights).some((value) => !Number.isFinite(value) || value < 0)) throw new RangeError('Coach job fit weights are invalid')
  return { ...opening, ...(opening.reputationRequirement === undefined ? {} : { reputationRequirement: { minimum: { ...opening.reputationRequirement.minimum } } }), ...(fitWeights === undefined ? {} : { fitWeights }) }
}

export function evaluateCoachJobEligibility(_employment: CoachEmployment, reputation: CoachReputationProfile, opening: CoachJobOpening): CoachJobEligibilityResult {
  if (opening.status !== 'open') return { eligible: false, reasons: [{ reason: 'jobNotOpen' }] }
  const requirement = evaluateCoachReputationRequirement(reputation, opening.reputationRequirement ?? {})
  return requirement.eligible ? { eligible: true, reasons: [] } : { eligible: false, reasons: [{ reason: 'reputationRequirementNotMet', unmet: requirement.unmet }] }
}

export function transitionCoachJobCandidacy(candidacy: CoachJobCandidacy, status: CoachJobCandidacyStatus): CoachCandidacyTransitionResult {
  const transitions: Readonly<Record<CoachJobCandidacyStatus, readonly CoachJobCandidacyStatus[]>> = { identified: ['interviewing', 'rejected', 'withdrawn'], interviewing: ['rejected', 'offered', 'withdrawn'], offered: ['hired', 'rejected', 'withdrawn'], rejected: [], withdrawn: [], hired: [] }
  return transitions[candidacy.status].includes(status) ? { ok: true, candidacy: { ...candidacy, status } } : { ok: false, reason: 'invalidCandidacyTransition' }
}

export function transitionCoachInterview(interview: CoachInterview, status: CoachInterviewStatus): CoachInterviewTransitionResult {
  return interview.status === 'scheduled' && status === 'completed' ? { ok: true, interview: { ...interview, status } } : { ok: false, reason: 'invalidInterviewTransition' }
}

export function decideCoachJobOffer(offer: CoachJobOffer, status: Exclude<CoachJobOfferStatus, 'pending'>): CoachOfferDecisionResult {
  return offer.status === 'pending' ? { ok: true, offer: { ...offer, status } } : { ok: false, reason: 'invalidOfferTransition' }
}

export function appointCoachToTeam(input: { readonly employment: CoachEmployment; readonly history: readonly CoachCareerHistoryEntry[]; readonly coachId: CoachId; readonly teamId: TeamId; readonly date: GameDate; readonly reason?: CoachAppointmentReason }): CoachCareerTransitionResult {
  if (input.employment.status === 'employed') return { ok: false, reason: input.employment.teamId === input.teamId ? 'alreadyEmployedByTeam' : 'invalidEmploymentState' }
  const reason = input.reason ?? 'hired'
  return { ok: true, employment: createCoachEmployment({ status: 'employed', teamId: input.teamId, startedOn: input.date }), history: [...input.history, { kind: 'appointment', coachId: input.coachId, teamId: input.teamId, date: input.date, reason }] }
}

export function fireCoach(input: { readonly employment: CoachEmployment; readonly history: readonly CoachCareerHistoryEntry[]; readonly decision: CoachFiringDecision }): CoachCareerTransitionResult {
  if (input.employment.status !== 'employed' || input.employment.teamId !== input.decision.teamId) return { ok: false, reason: 'invalidEmploymentState' }
  return { ok: true, employment: createCoachEmployment({ status: 'unemployed' }), history: [...input.history, { kind: 'departure', coachId: input.decision.coachId, teamId: input.decision.teamId, date: input.decision.date, reason: 'fired' }] }
}

export function leaveForAnotherJob(input: { readonly employment: CoachEmployment; readonly history: readonly CoachCareerHistoryEntry[]; readonly coachId: CoachId; readonly date: GameDate }): CoachCareerTransitionResult {
  if (input.employment.status !== 'employed' || input.employment.teamId === undefined) return { ok: false, reason: 'invalidEmploymentState' }
  return { ok: true, employment: createCoachEmployment({ status: 'unemployed' }), history: [...input.history, { kind: 'departure', coachId: input.coachId, teamId: input.employment.teamId, date: input.date, reason: 'acceptedOtherJob' }] }
}

function careerId<Kind extends string>(value: string, name: string): CoachCareerId<Kind> { if (!value.trim()) throw new RangeError(`${name} must be non-empty`); return value as CoachCareerId<Kind> }
