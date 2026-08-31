import type { GameDate } from '@/domain/date'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import type { StaffRoleId } from '@/domain/staff'

declare const staffCareerIdBrand: unique symbol
type StaffCareerId<Kind extends string> = string & { readonly [staffCareerIdBrand]: Kind }
export type StaffJobOpeningId = StaffCareerId<'StaffJobOpeningId'>
export type StaffJobCandidacyId = StaffCareerId<'StaffJobCandidacyId'>
export type StaffJobOfferId = StaffCareerId<'StaffJobOfferId'>

export const staffJobOpeningIdFromString = (value: string): StaffJobOpeningId => careerId(value, 'Staff job opening ID')
export const staffJobCandidacyIdFromString = (value: string): StaffJobCandidacyId => careerId(value, 'Staff job candidacy ID')
export const staffJobOfferIdFromString = (value: string): StaffJobOfferId => careerId(value, 'Staff job offer ID')

export type StaffEmploymentStatus = 'employed' | 'unemployed'
export interface StaffEmployment { readonly status: StaffEmploymentStatus; readonly teamId?: TeamId; readonly roleId?: StaffRoleId; readonly startedOn?: GameDate }

export type StaffAppointmentReason = 'initialAppointment' | 'hired' | 'promoted' | 'reassigned'
export type StaffDepartureReason = 'fired' | 'resigned' | 'acceptedOtherJob' | 'retired'

export interface StaffCareerAppointmentEntry { readonly kind: 'appointment'; readonly staffId: StaffPersonId; readonly teamId: TeamId; readonly roleId: StaffRoleId; readonly date: GameDate; readonly reason: StaffAppointmentReason }
export interface StaffCareerDepartureEntry { readonly kind: 'departure'; readonly staffId: StaffPersonId; readonly teamId: TeamId; readonly date: GameDate; readonly reason: StaffDepartureReason }
export type StaffCareerHistoryEntry = StaffCareerAppointmentEntry | StaffCareerDepartureEntry

export type StaffJobOpeningStatus = 'open' | 'filled' | 'closed'
export interface StaffJobOpening { readonly id: StaffJobOpeningId; readonly teamId: TeamId; readonly roleId: StaffRoleId; readonly status: StaffJobOpeningStatus; readonly createdOn: GameDate }

export type StaffJobCandidacyStatus = 'identified' | 'interviewing' | 'rejected' | 'offered' | 'withdrawn' | 'hired'
export interface StaffJobCandidacy { readonly id: StaffJobCandidacyId; readonly jobOpeningId: StaffJobOpeningId; readonly staffId: StaffPersonId; readonly status: StaffJobCandidacyStatus; readonly createdOn: GameDate }

export type StaffInterviewStatus = 'scheduled' | 'completed'
export interface StaffInterview { readonly candidacyId: StaffJobCandidacyId; readonly status: StaffInterviewStatus }

export type StaffJobOfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn'
export interface StaffJobOffer { readonly id: StaffJobOfferId; readonly jobOpeningId: StaffJobOpeningId; readonly staffId: StaffPersonId; readonly teamId: TeamId; readonly annualSalary?: number; readonly createdOn: GameDate; readonly status: StaffJobOfferStatus }

export type StaffFiringReason = 'performance' | 'budgetCuts' | 'roleEliminated'
export interface StaffFiringDecision { readonly staffId: StaffPersonId; readonly teamId: TeamId; readonly date: GameDate; readonly reason: StaffFiringReason }

export type StaffCareerFailureReason = 'invalidEmploymentState' | 'alreadyEmployedByTeam' | 'invalidCandidacyTransition' | 'invalidInterviewTransition' | 'invalidOfferTransition'
export type StaffCareerTransitionResult = { readonly ok: true; readonly employment: StaffEmployment; readonly history: readonly StaffCareerHistoryEntry[] } | { readonly ok: false; readonly reason: StaffCareerFailureReason }
export type StaffCandidacyTransitionResult = { readonly ok: true; readonly candidacy: StaffJobCandidacy } | { readonly ok: false; readonly reason: 'invalidCandidacyTransition' }
export type StaffInterviewTransitionResult = { readonly ok: true; readonly interview: StaffInterview } | { readonly ok: false; readonly reason: 'invalidInterviewTransition' }
export type StaffOfferDecisionResult = { readonly ok: true; readonly offer: StaffJobOffer } | { readonly ok: false; readonly reason: 'invalidOfferTransition' }

export function createStaffEmployment(employment: StaffEmployment): StaffEmployment {
  if (employment.status === 'employed') {
    if (employment.teamId === undefined || employment.roleId === undefined) throw new RangeError('Employed Staff requires a Team and role')
    return { status: 'employed', teamId: employment.teamId, roleId: employment.roleId, ...(employment.startedOn === undefined ? {} : { startedOn: employment.startedOn }) }
  }
  if (employment.status !== 'unemployed' || employment.teamId !== undefined || employment.roleId !== undefined || employment.startedOn !== undefined) throw new RangeError('Unemployed Staff cannot have Team, role or start date')
  return { status: 'unemployed' }
}

export function createStaffJobOpening(opening: StaffJobOpening): StaffJobOpening {
  return { ...opening }
}

export function evaluateStaffJobEligibility(opening: StaffJobOpening): { readonly eligible: boolean } {
  return { eligible: opening.status === 'open' }
}

export function transitionStaffJobCandidacy(candidacy: StaffJobCandidacy, status: StaffJobCandidacyStatus): StaffCandidacyTransitionResult {
  const transitions: Readonly<Record<StaffJobCandidacyStatus, readonly StaffJobCandidacyStatus[]>> = { identified: ['interviewing', 'rejected', 'withdrawn'], interviewing: ['rejected', 'offered', 'withdrawn'], offered: ['hired', 'rejected', 'withdrawn'], rejected: [], withdrawn: [], hired: [] }
  return transitions[candidacy.status].includes(status) ? { ok: true, candidacy: { ...candidacy, status } } : { ok: false, reason: 'invalidCandidacyTransition' }
}

export function transitionStaffInterview(interview: StaffInterview, status: StaffInterviewStatus): StaffInterviewTransitionResult {
  return interview.status === 'scheduled' && status === 'completed' ? { ok: true, interview: { ...interview, status } } : { ok: false, reason: 'invalidInterviewTransition' }
}

export function decideStaffJobOffer(offer: StaffJobOffer, status: Exclude<StaffJobOfferStatus, 'pending'>): StaffOfferDecisionResult {
  return offer.status === 'pending' ? { ok: true, offer: { ...offer, status } } : { ok: false, reason: 'invalidOfferTransition' }
}

export function appointStaffToTeam(input: { readonly employment: StaffEmployment; readonly history: readonly StaffCareerHistoryEntry[]; readonly staffId: StaffPersonId; readonly teamId: TeamId; readonly roleId: StaffRoleId; readonly date: GameDate; readonly reason?: StaffAppointmentReason }): StaffCareerTransitionResult {
  if (input.employment.status === 'employed') return { ok: false, reason: input.employment.teamId === input.teamId ? 'alreadyEmployedByTeam' : 'invalidEmploymentState' }
  const reason = input.reason ?? 'hired'
  return { ok: true, employment: createStaffEmployment({ status: 'employed', teamId: input.teamId, roleId: input.roleId, startedOn: input.date }), history: [...input.history, { kind: 'appointment', staffId: input.staffId, teamId: input.teamId, roleId: input.roleId, date: input.date, reason }] }
}

/**
 * Same-team role change only — `appointStaffToTeam` remains the sole cross-team appointment path.
 * `employment.startedOn` (the original hire/appointment date with THIS team) is deliberately
 * preserved unchanged — a promotion/reassignment is a role change within an ongoing employment
 * relationship, not a new one, so it must never reset "how long has this Staff person been with
 * the team." The role change itself is still recorded, both on `StaffEmployment.roleId` and as a
 * new `CareerHistory` appointment entry dated `input.date` with the appropriate reason.
 */
export function promoteOrReassignStaff(input: { readonly employment: StaffEmployment; readonly history: readonly StaffCareerHistoryEntry[]; readonly staffId: StaffPersonId; readonly roleId: StaffRoleId; readonly date: GameDate; readonly reason: 'promoted' | 'reassigned' }): StaffCareerTransitionResult {
  if (input.employment.status !== 'employed' || input.employment.teamId === undefined) return { ok: false, reason: 'invalidEmploymentState' }
  const teamId = input.employment.teamId
  return { ok: true, employment: createStaffEmployment({ status: 'employed', teamId, roleId: input.roleId, ...(input.employment.startedOn === undefined ? {} : { startedOn: input.employment.startedOn }) }), history: [...input.history, { kind: 'appointment', staffId: input.staffId, teamId, roleId: input.roleId, date: input.date, reason: input.reason }] }
}

export function fireStaff(input: { readonly employment: StaffEmployment; readonly history: readonly StaffCareerHistoryEntry[]; readonly decision: StaffFiringDecision }): StaffCareerTransitionResult {
  if (input.employment.status !== 'employed' || input.employment.teamId !== input.decision.teamId) return { ok: false, reason: 'invalidEmploymentState' }
  return { ok: true, employment: createStaffEmployment({ status: 'unemployed' }), history: [...input.history, { kind: 'departure', staffId: input.decision.staffId, teamId: input.decision.teamId, date: input.decision.date, reason: 'fired' }] }
}

export function staffLeaveForAnotherJob(input: { readonly employment: StaffEmployment; readonly history: readonly StaffCareerHistoryEntry[]; readonly staffId: StaffPersonId; readonly date: GameDate }): StaffCareerTransitionResult {
  if (input.employment.status !== 'employed' || input.employment.teamId === undefined) return { ok: false, reason: 'invalidEmploymentState' }
  return { ok: true, employment: createStaffEmployment({ status: 'unemployed' }), history: [...input.history, { kind: 'departure', staffId: input.staffId, teamId: input.employment.teamId, date: input.date, reason: 'acceptedOtherJob' }] }
}

function careerId<Kind extends string>(value: string, name: string): StaffCareerId<Kind> { if (!value.trim()) throw new RangeError(`${name} must be non-empty`); return value as StaffCareerId<Kind> }
