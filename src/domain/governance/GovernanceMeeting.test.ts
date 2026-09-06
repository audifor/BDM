import { describe, expect, it } from 'vitest'
import { createGovernanceMeeting, createGovernanceMeetingAgendaItem, createGovernanceMeetingEvent, createGovernanceMeetingParticipant, deriveGovernanceMeetingScheduledFor, deriveGovernanceMeetingStatus, sortGovernanceMeetingAgendaItems, validateGovernanceMeetingLifecycle } from './GovernanceMeeting'

const meeting = { id: 'meeting', institutionId: 'institution', conveningBodyId: 'body', category: 'ORDINARY' as const, title: 'Board meeting', createdOn: '2032-01-01' as never }
const scheduled = (id = '01', effectiveOn = '2032-01-01' as never, scheduledFor = '2032-01-03' as never) => createGovernanceMeetingEvent({ id, meetingId: meeting.id, kind: 'SCHEDULED', effectiveOn, scheduledFor })

describe('Governance meetings', () => {
  it('validates the meeting root and its closed enums', () => {
    expect(createGovernanceMeeting(meeting)).toEqual(meeting)
    for (const invalid of [{ ...meeting, id: ' ' }, { ...meeting, institutionId: ' ' }, { ...meeting, conveningBodyId: ' ' }, { ...meeting, title: ' ' }, { ...meeting, category: 'OTHER' as never }, { ...meeting, createdOn: 'bad' as never }]) expect(() => createGovernanceMeeting(invalid)).toThrow()
  })
  it('enforces the additive lifecycle and derives its current schedule/status deterministically', () => {
    const rescheduled = createGovernanceMeetingEvent({ id: '02', meetingId: meeting.id, kind: 'RESCHEDULED', effectiveOn: '2032-01-02' as never, scheduledFor: '2032-01-04' as never })
    const held = createGovernanceMeetingEvent({ id: '03', meetingId: meeting.id, kind: 'HELD', effectiveOn: '2032-01-04' as never })
    expect(() => validateGovernanceMeetingLifecycle([scheduled(), rescheduled, held])).not.toThrow()
    expect(deriveGovernanceMeetingScheduledFor([rescheduled, scheduled()])).toBe('2032-01-04')
    expect(deriveGovernanceMeetingStatus([held, scheduled(), rescheduled])).toBe('HELD')
    expect(() => validateGovernanceMeetingLifecycle([])).toThrow()
    expect(() => validateGovernanceMeetingLifecycle([scheduled(), scheduled('02')])).toThrow()
    expect(() => validateGovernanceMeetingLifecycle([scheduled(), held, { ...rescheduled, id: '04', effectiveOn: '2032-01-05' as never }])).toThrow()
    expect(() => createGovernanceMeetingEvent({ id: 'bad', meetingId: meeting.id, kind: 'HELD', effectiveOn: 'bad' as never })).toThrow()
  })
  it('accepts only supported interaction parties and valid participant enums', () => {
    for (const party of [{ kind: 'BODY' as const, bodyId: 'body' }, { kind: 'APPOINTMENT' as const, appointmentId: 'appointment' }, { kind: 'ACTOR' as const, actor: { kind: 'COACH' as const, id: 'coach' } }, { kind: 'ACTOR' as const, actor: { kind: 'STAFF' as const, id: 'staff' } }]) expect(createGovernanceMeetingParticipant({ id: JSON.stringify(party), meetingId: meeting.id, party, role: 'ATTENDEE', attendance: 'PRESENT' })).toBeDefined()
    expect(() => createGovernanceMeetingParticipant({ id: 'external', meetingId: meeting.id, party: { kind: 'ACTOR', actor: { kind: 'EXTERNAL' as never, id: 'x' } }, role: 'ATTENDEE', attendance: 'PRESENT' })).toThrow()
  })
  it('validates agenda references and sorts them by sequence then ID', () => {
    const items = [createGovernanceMeetingAgendaItem({ id: 'b', meetingId: meeting.id, sequence: 2, subject: { kind: 'INSTITUTIONAL_TOPIC', topic: 'Budget' } }), createGovernanceMeetingAgendaItem({ id: 'a', meetingId: meeting.id, sequence: 1, subject: { kind: 'GOVERNANCE_DECISION', decisionId: 'decision' } })]
    expect(sortGovernanceMeetingAgendaItems(items).map((item) => item.id)).toEqual(['a', 'b'])
    expect(() => createGovernanceMeetingAgendaItem({ id: 'bad', meetingId: meeting.id, sequence: 0, subject: { kind: 'GOVERNANCE_OBJECTIVE', objectiveId: 'objective' } })).toThrow()
  })
})
