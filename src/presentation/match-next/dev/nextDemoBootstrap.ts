/**
 * Builds a REAL MatchEngine Next live session for the presentation demo/audits, through the same application
 * path as the product: createNewGame -> MatchEnginePort('match-next').prepare -> createLiveSession.
 * Nothing is scripted here; ticks come only from MatchNextLiveController.
 */

import { createNewGame } from '@/app/game/createNewGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import type { MatchNextLiveController } from '@/app/matchNext/MatchNextLiveController'
import type { MatchSetup } from '@/engine/match-next'
import type { PlayerId } from '@/domain/ids'
import { toNextTickFrame } from '../MatchNextPresentationBridge'
import type { NextPlayerLabels, NextTickFrame } from '../types'

export interface NextDemoSession {
  readonly seed: number
  readonly setup: MatchSetup
  readonly controller: MatchNextLiveController
  readonly labels: NextPlayerLabels
  /** Current canonical tick (no advance). */
  first(): NextTickFrame
  /** Advances the engine by exactly one tick and returns it, or undefined when the match is complete. */
  step(): NextTickFrame | undefined
}

export interface NextDemoOptions {
  readonly periodSeconds?: number
  readonly periodCount?: number
}

export function createNextDemoSession(seed = 424242, options: NextDemoOptions = {}): NextDemoSession {
  const world = createNewGame()
  const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
  const port = createMatchEnginePort('match-next')
  const prepared = port.prepare(world, game, seed)
  const setup: MatchSetup = {
    ...prepared,
    clockRules: {
      ...prepared.clockRules,
      ...(options.periodSeconds === undefined ? {} : { periodSeconds: options.periodSeconds }),
      ...(options.periodCount === undefined ? {} : { periodCount: options.periodCount }),
    },
  }
  const controller = port.createLiveSession(setup)
  const labels = new Map<PlayerId, { label: string; jersey: number }>()
  ;[...setup.homeSquad, ...setup.awaySquad].forEach((playerId, index) => {
    const player = world.players[playerId]
    labels.set(playerId, { label: player === undefined ? String(playerId).slice(-6) : `${player.firstName[0]}. ${player.lastName}`, jersey: (index % setup.homeSquad.length) + 4 })
  })
  let lastSequence = 0
  const project = (complete: boolean): NextTickFrame => {
    const frame = controller.snapshot().frame
    const projected = toNextTickFrame(frame, labels, lastSequence, complete)
    for (const event of frame.events) lastSequence = Math.max(lastSequence, event.sequence)
    return projected
  }
  const firstFrame = project(false)
  return {
    seed,
    setup,
    controller,
    labels,
    first: () => firstFrame,
    step(): NextTickFrame | undefined {
      if (controller.matchState.isComplete) return undefined
      controller.advanceOneStep()
      return project(controller.matchState.isComplete)
    },
  }
}
