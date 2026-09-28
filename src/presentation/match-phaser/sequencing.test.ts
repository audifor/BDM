import { describe, expect, it } from 'vitest'

import { teamIdFromString, playerIdFromString } from '@/domain/ids'
import { ActionSequencer } from './sequencing'
import type { MatchPresentationEvent } from './visualTypes'

function makeEvent(overrides: Partial<MatchPresentationEvent>): MatchPresentationEvent {
  return {
    kind: 'shotMade',
    sequence: 1,
    period: 1,
    clockSecondsRemaining: 500,
    teamId: teamIdFromString('team-1'),
    playerId: playerIdFromString('p1'),
    secondaryPlayerId: undefined,
    points: 2,
    homeScore: 2,
    awayScore: 0,
    ...overrides,
  }
}

describe('ActionSequencer', () => {
  it('keeps a beat active for its configured duration and then drops it', () => {
    const sequencer = new ActionSequencer()
    sequencer.ingest([makeEvent({ sequence: 1 })], 1000)
    expect(sequencer.activeBeats(1000)).toHaveLength(1)
    expect(sequencer.activeBeats(1300)).toHaveLength(1)
    expect(sequencer.activeBeats(3000)).toHaveLength(0)
  })

  it('never replays an event it has already seen (idempotent ingest, matches sequence semantics)', () => {
    const sequencer = new ActionSequencer()
    const event = makeEvent({ sequence: 5 })
    sequencer.ingest([event], 0)
    sequencer.ingest([event], 50)
    sequencer.ingest([event], 100)
    expect(sequencer.activeBeats(100)).toHaveLength(1)
  })

  it('never mutates or reorders the event content it is given (score/kind/sequence stay verbatim)', () => {
    const sequencer = new ActionSequencer()
    const event = makeEvent({ sequence: 9, kind: 'shotMissed', homeScore: 4, awayScore: 6 })
    sequencer.ingest([event], 0)
    const [beat] = sequencer.activeBeats(0)
    expect(beat!.event).toBe(event)
    expect(beat!.event.homeScore).toBe(4)
    expect(beat!.event.awayScore).toBe(6)
    expect(beat!.event.kind).toBe('shotMissed')
  })
})
