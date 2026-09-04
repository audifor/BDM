import { describe, expect, it } from 'vitest'
import { createStaffPoliticalAction, staffPoliticalActionIdFor } from './StaffPoliticalAction'

const caseId = 'staff-political-case:team:CAREER_REQUEST:request'
const action = (kind: 'ENDORSE' | 'LOBBY' | 'COORDINATE' | 'MEDIATE', stance: 'SUPPORT' | 'OPPOSE' | 'MEDIATE', actorIds: string[], target?: { kind: 'COACH'; id: string }) => ({ id: staffPoliticalActionIdFor(caseId, kind, stance, actorIds as never, target), caseId, teamId: 'team' as never, kind, stance, actorIds: actorIds as never, ...(target === undefined ? {} : { target }), performedOn: '2030-01-01' as never })

describe('StaffPoliticalAction', () => {
  it('accepts each canonical action shape', () => {
    expect(createStaffPoliticalAction(action('ENDORSE', 'SUPPORT', ['a']))).toMatchObject({ kind: 'ENDORSE' })
    expect(createStaffPoliticalAction(action('LOBBY', 'SUPPORT', ['a'], { kind: 'COACH', id: 'coach' }))).toMatchObject({ stance: 'SUPPORT' })
    expect(createStaffPoliticalAction(action('LOBBY', 'OPPOSE', ['a'], { kind: 'COACH', id: 'coach' }))).toMatchObject({ stance: 'OPPOSE' })
    expect(createStaffPoliticalAction(action('COORDINATE', 'SUPPORT', ['a', 'b']))).toMatchObject({ kind: 'COORDINATE' })
    expect(createStaffPoliticalAction(action('COORDINATE', 'OPPOSE', ['a', 'b']))).toMatchObject({ stance: 'OPPOSE' })
    expect(createStaffPoliticalAction(action('MEDIATE', 'MEDIATE', ['a']))).toMatchObject({ kind: 'MEDIATE' })
  })

  it('rejects invalid semantics, duplicate/unsorted actors, and noncanonical IDs', () => {
    expect(() => createStaffPoliticalAction(action('ENDORSE', 'OPPOSE', ['a']))).toThrow()
    expect(() => createStaffPoliticalAction(action('LOBBY', 'MEDIATE', ['a'], { kind: 'COACH', id: 'coach' }))).toThrow()
    expect(() => createStaffPoliticalAction(action('COORDINATE', 'MEDIATE', ['a', 'b']))).toThrow()
    expect(() => createStaffPoliticalAction(action('COORDINATE', 'SUPPORT', ['a']))).toThrow()
    expect(() => createStaffPoliticalAction(action('MEDIATE', 'MEDIATE', ['a', 'a']))).toThrow()
    expect(() => createStaffPoliticalAction(action('COORDINATE', 'SUPPORT', ['b', 'a']))).toThrow()
    expect(() => createStaffPoliticalAction({ ...action('ENDORSE', 'SUPPORT', ['a']), id: 'fake' })).toThrow()
  })

  it('fails closed for unknown target kinds and missing or empty LOBBY targets', () => {
    for (const kind of ['BOARD', 'EXECUTIVE'] as const) {
      const target = { kind, id: 'authority' } as never
      expect(() => createStaffPoliticalAction({ ...action('LOBBY', 'SUPPORT', ['a'], target), target })).toThrow()
    }
    expect(() => staffPoliticalActionIdFor(caseId, 'LOBBY', 'SUPPORT', ['a'] as never)).toThrow(TypeError)
    expect(() => createStaffPoliticalAction({ ...action('LOBBY', 'SUPPORT', ['a'], { kind: 'COACH', id: '' }), target: { kind: 'COACH', id: '' } })).toThrow()
  })
})
