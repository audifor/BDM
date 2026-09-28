/**
 * sequencing.ts — MP1G Basketball Action Sequencing.
 *
 * Converts the arrival of MatchPresentationEvents into a short, ordered list of visual "beats"
 * (e.g. shotMade -> gather/release already implied by ball flight, then rim interaction, then
 * make flash, then next-action) so a made shot doesn't just flash and disappear on the exact same
 * frame the engine decided it. This never delays or reorders the engine's own facts: `sequence`,
 * `homeScore`, `awayScore`, and outcome kind are always taken verbatim from the event. It only
 * decides how many wall-clock milliseconds each already-decided outcome stays visible for, via a
 * small FIFO buffer — i.e. presentation may lag slightly behind the engine, never re-simulate it.
 */

import type { MatchPresentationEvent, MatchPresentationEventKind } from './visualTypes'

export type SequenceBeatKind = 'flash' | 'rimInteraction' | 'reboundContest' | 'reboundSecured'

export interface SequenceBeat {
  readonly kind: SequenceBeatKind
  readonly event: MatchPresentationEvent
  readonly startedAtMs: number
  readonly durationMs: number
}

const BEAT_DURATIONS_MS: Partial<Record<MatchPresentationEventKind, number>> = {
  shotMade: 1400,
  shotMissed: 900,
  rebound: 1100,
  turnover: 1200,
  passCompleted: 500,
  foul: 1200,
  freeThrowMade: 1200,
  freeThrowMissed: 900,
  periodStart: 1000,
  periodEnd: 1400,
  gameEnd: 2000,
  substitution: 900,
}

/**
 * A small ordered queue of "currently playing" visual beats. The scene asks it each frame which
 * beats are still active; expired beats are dropped. Never mutates or re-derives event content.
 */
export class ActionSequencer {
  private active: SequenceBeat[] = []
  private lastSeenSequence = 0

  public ingest(events: readonly MatchPresentationEvent[], nowMs: number): void {
    for (const event of events) {
      if (event.sequence <= this.lastSeenSequence) continue
      this.lastSeenSequence = event.sequence
      const duration = BEAT_DURATIONS_MS[event.kind] ?? 700
      this.active.push({ kind: 'flash', event, startedAtMs: nowMs, durationMs: duration })
    }
  }

  public activeBeats(nowMs: number): readonly SequenceBeat[] {
    this.active = this.active.filter((beat) => nowMs - beat.startedAtMs < beat.durationMs)
    return this.active
  }

  public reset(): void {
    this.active = []
    this.lastSeenSequence = 0
  }
}
