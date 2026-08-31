import { describe, expect, it } from 'vitest'
import { staffPersonIdFromString, teamIdFromString } from '@/domain/ids'
import {
  appointStaffToTeam,
  createStaffEmployment,
  createStaffJobOpening,
  decideStaffJobOffer,
  evaluateStaffJobEligibility,
  fireStaff,
  promoteOrReassignStaff,
  staffJobCandidacyIdFromString,
  staffJobOfferIdFromString,
  staffJobOpeningIdFromString,
  staffLeaveForAnotherJob,
  transitionStaffInterview,
  transitionStaffJobCandidacy,
  type StaffCareerHistoryEntry,
  type StaffJobCandidacy,
  type StaffJobCandidacyStatus,
} from './StaffCareer'

const staffId = staffPersonIdFromString('staff-1')
const teamId = teamIdFromString('team-1')
const otherTeamId = teamIdFromString('team-2')
const date = '2032-10-01' as never

describe('createStaffEmployment', () => {
  it('accepts employed with team and role', () => {
    const employment = createStaffEmployment({ status: 'employed', teamId, roleId: 'advanceScout' as never, startedOn: date })
    expect(employment).toEqual({ status: 'employed', teamId, roleId: 'advanceScout', startedOn: date })
  })

  it('rejects employed without a team', () => {
    expect(() => createStaffEmployment({ status: 'employed', roleId: 'advanceScout' as never })).toThrow(RangeError)
  })

  it('rejects employed without a role', () => {
    expect(() => createStaffEmployment({ status: 'employed', teamId })).toThrow(RangeError)
  })

  it('accepts unemployed with no team/role/date', () => {
    expect(createStaffEmployment({ status: 'unemployed' })).toEqual({ status: 'unemployed' })
  })

  it('rejects unemployed with a stray team', () => {
    expect(() => createStaffEmployment({ status: 'unemployed', teamId })).toThrow(RangeError)
  })
})

describe('createStaffJobOpening / evaluateStaffJobEligibility', () => {
  it('constructs an opening as given', () => {
    const opening = createStaffJobOpening({ id: staffJobOpeningIdFromString('opening-1'), teamId, roleId: 'advanceScout' as never, status: 'open', createdOn: date })
    expect(opening.status).toBe('open')
  })

  it('is eligible only when open', () => {
    const open = createStaffJobOpening({ id: staffJobOpeningIdFromString('opening-1'), teamId, roleId: 'advanceScout' as never, status: 'open', createdOn: date })
    const filled = { ...open, status: 'filled' as const }
    expect(evaluateStaffJobEligibility(open).eligible).toBe(true)
    expect(evaluateStaffJobEligibility(filled).eligible).toBe(false)
  })
})

describe('transitionStaffJobCandidacy: transition table parity with Coach Career', () => {
  function candidacy(status: StaffJobCandidacyStatus): StaffJobCandidacy {
    return { id: staffJobCandidacyIdFromString('candidacy-1'), jobOpeningId: staffJobOpeningIdFromString('opening-1'), staffId, status, createdOn: date }
  }

  it('identified -> interviewing/rejected/withdrawn are legal', () => {
    for (const next of ['interviewing', 'rejected', 'withdrawn'] as const) {
      expect(transitionStaffJobCandidacy(candidacy('identified'), next).ok).toBe(true)
    }
  })

  it('identified -> offered/hired are illegal', () => {
    for (const next of ['offered', 'hired'] as const) {
      const result = transitionStaffJobCandidacy(candidacy('identified'), next)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('invalidCandidacyTransition')
    }
  })

  it('interviewing -> rejected/offered/withdrawn are legal', () => {
    for (const next of ['rejected', 'offered', 'withdrawn'] as const) {
      expect(transitionStaffJobCandidacy(candidacy('interviewing'), next).ok).toBe(true)
    }
  })

  it('offered -> hired/rejected/withdrawn are legal', () => {
    for (const next of ['hired', 'rejected', 'withdrawn'] as const) {
      expect(transitionStaffJobCandidacy(candidacy('offered'), next).ok).toBe(true)
    }
  })

  it('terminal states (rejected/withdrawn/hired) accept no further transitions', () => {
    for (const terminal of ['rejected', 'withdrawn', 'hired'] as const) {
      for (const next of ['identified', 'interviewing', 'rejected', 'offered', 'withdrawn', 'hired'] as const) {
        if (next === terminal) continue
        expect(transitionStaffJobCandidacy(candidacy(terminal), next).ok).toBe(false)
      }
    }
  })
})

describe('transitionStaffInterview', () => {
  it('scheduled -> completed is legal', () => {
    expect(transitionStaffInterview({ candidacyId: staffJobCandidacyIdFromString('candidacy-1'), status: 'scheduled' }, 'completed').ok).toBe(true)
  })
  it('completed -> completed is illegal (no further transitions)', () => {
    const result = transitionStaffInterview({ candidacyId: staffJobCandidacyIdFromString('candidacy-1'), status: 'completed' }, 'completed')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalidInterviewTransition')
  })
})

describe('decideStaffJobOffer', () => {
  const offer = { id: staffJobOfferIdFromString('offer-1'), jobOpeningId: staffJobOpeningIdFromString('opening-1'), staffId, teamId, createdOn: date, status: 'pending' as const }
  it('pending -> accepted/declined/withdrawn are legal', () => {
    for (const next of ['accepted', 'declined', 'withdrawn'] as const) expect(decideStaffJobOffer(offer, next).ok).toBe(true)
  })
  it('a non-pending offer cannot transition again', () => {
    const result = decideStaffJobOffer({ ...offer, status: 'accepted' }, 'declined')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalidOfferTransition')
  })
})

describe('appointStaffToTeam: appointment from unemployed', () => {
  it('appoints an unemployed Staff person, defaulting reason to hired', () => {
    const result = appointStaffToTeam({ employment: { status: 'unemployed' }, history: [], staffId, teamId, roleId: 'advanceScout' as never, date })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.employment).toEqual({ status: 'employed', teamId, roleId: 'advanceScout', startedOn: date })
      expect(result.history).toEqual([{ kind: 'appointment', staffId, teamId, roleId: 'advanceScout', date, reason: 'hired' }])
    }
  })

  it('rejects double-employment on a different team', () => {
    const employed = { status: 'employed' as const, teamId, roleId: 'advanceScout' as never, startedOn: date }
    const result = appointStaffToTeam({ employment: employed, history: [], staffId, teamId: otherTeamId, roleId: 'advanceScout' as never, date })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalidEmploymentState')
  })

  it('rejects re-appointing to the SAME team with a distinct alreadyEmployedByTeam reason', () => {
    const employed = { status: 'employed' as const, teamId, roleId: 'advanceScout' as never, startedOn: date }
    const result = appointStaffToTeam({ employment: employed, history: [], staffId, teamId, roleId: 'headScout' as never, date })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('alreadyEmployedByTeam')
  })

  it('appends an appointment history entry with an explicit initialAppointment reason when requested', () => {
    const result = appointStaffToTeam({ employment: { status: 'unemployed' }, history: [], staffId, teamId, roleId: 'advanceScout' as never, date, reason: 'initialAppointment' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.history[0]!.reason).toBe('initialAppointment')
  })
})

describe('fireStaff: fire lifecycle', () => {
  it('fires a currently-employed Staff person on the matching team', () => {
    const employed = { status: 'employed' as const, teamId, roleId: 'advanceScout' as never, startedOn: date }
    const result = fireStaff({ employment: employed, history: [], decision: { staffId, teamId, date, reason: 'performance' } })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.employment).toEqual({ status: 'unemployed' })
      expect(result.history).toEqual([{ kind: 'departure', staffId, teamId, date, reason: 'fired' }])
    }
  })

  it('rejects firing an unemployed Staff person', () => {
    const result = fireStaff({ employment: { status: 'unemployed' }, history: [], decision: { staffId, teamId, date, reason: 'performance' } })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalidEmploymentState')
  })

  it('rejects firing from a team the Staff person is not actually on', () => {
    const employed = { status: 'employed' as const, teamId, roleId: 'advanceScout' as never, startedOn: date }
    const result = fireStaff({ employment: employed, history: [], decision: { staffId, teamId: otherTeamId, date, reason: 'performance' } })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalidEmploymentState')
  })
})

describe('staffLeaveForAnotherJob: leave-for-another-job lifecycle', () => {
  it('vacates employment with reason acceptedOtherJob', () => {
    const employed = { status: 'employed' as const, teamId, roleId: 'advanceScout' as never, startedOn: date }
    const result = staffLeaveForAnotherJob({ employment: employed, history: [], staffId, date })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.employment).toEqual({ status: 'unemployed' })
      expect(result.history).toEqual([{ kind: 'departure', staffId, teamId, date, reason: 'acceptedOtherJob' }])
    }
  })

  it('rejects leaving when already unemployed', () => {
    const result = staffLeaveForAnotherJob({ employment: { status: 'unemployed' }, history: [], staffId, date })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalidEmploymentState')
  })
})

describe('promoteOrReassignStaff: promote/reassign lifecycle and history reasons', () => {
  it('promotes within the same team, appending an appointment entry with reason promoted', () => {
    const employed = { status: 'employed' as const, teamId, roleId: 'advanceScout' as never, startedOn: date }
    const result = promoteOrReassignStaff({ employment: employed, history: [], staffId, roleId: 'headScout' as never, date, reason: 'promoted' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.employment).toEqual({ status: 'employed', teamId, roleId: 'headScout', startedOn: date })
      const last = result.history.at(-1) as StaffCareerHistoryEntry
      expect(last.kind).toBe('appointment')
      expect((last as { readonly reason: string }).reason).toBe('promoted')
    }
  })

  it('reassigns within the same team, appending an appointment entry with reason reassigned', () => {
    const employed = { status: 'employed' as const, teamId, roleId: 'advanceScout' as never, startedOn: date }
    const result = promoteOrReassignStaff({ employment: employed, history: [], staffId, roleId: 'collegeScout' as never, date, reason: 'reassigned' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const last = result.history.at(-1) as StaffCareerHistoryEntry
      expect((last as { readonly reason: string }).reason).toBe('reassigned')
    }
  })

  it('never changes the team', () => {
    const employed = { status: 'employed' as const, teamId, roleId: 'advanceScout' as never, startedOn: date }
    const result = promoteOrReassignStaff({ employment: employed, history: [], staffId, roleId: 'headScout' as never, date, reason: 'promoted' })
    if (result.ok) expect(result.employment.teamId).toBe(teamId)
  })

  it('rejects promoting an unemployed Staff person', () => {
    const result = promoteOrReassignStaff({ employment: { status: 'unemployed' }, history: [], staffId, roleId: 'headScout' as never, date, reason: 'promoted' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalidEmploymentState')
  })

  it('preserves the original employment.startedOn (hire date) across a later promotion/reassignment on a distinct date (Issue #19 review "startedOn" fix)', () => {
    const hireDate = '2032-10-01' as never
    const promotionDate = '2033-06-15' as never
    const hired = { status: 'employed' as const, teamId, roleId: 'advanceScout' as never, startedOn: hireDate }
    const promoted = promoteOrReassignStaff({ employment: hired, history: [], staffId, roleId: 'headScout' as never, date: promotionDate, reason: 'promoted' })
    expect(promoted.ok).toBe(true)
    if (promoted.ok) {
      // startedOn is unchanged — still the original hire date, not the promotion date.
      expect(promoted.employment.startedOn).toBe(hireDate)
      expect(promoted.employment.roleId).toBe('headScout')
      // The CareerHistory entry records the role change dated at the promotion date.
      const entry = promoted.history.at(-1) as StaffCareerHistoryEntry
      expect(entry.date).toBe(promotionDate)
      expect((entry as { readonly reason: string }).reason).toBe('promoted')
    }
  })
})
