import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createNewGame, prepareUserMatch } from '@/app/game'
import { createDefaultTacticalPlan } from '@/engine/match'

import { MatchViewerScreen } from './MatchViewerScreen'

function renderViewer(currentEventIndex = 0, isPlaying = true): string {
  const world = createNewGame()
  const simulation = prepareUserMatch(world)
  const homeTeam = world.teams[simulation.homeTeamId]!
  return renderToStaticMarkup(createElement(MatchViewerScreen, {
    world, simulation, homeTeamName: homeTeam.name, awayTeamName: world.teams[simulation.awayTeamId]!.name,
    currentEventIndex, isPlaying, speed: 1, resultApplied: false,
    onPause: () => undefined, onResume: () => undefined, onSpeedChange: () => undefined, onRevealNext: () => undefined,
    onRequestPresentationSegment: () => { throw new Error('Presentation is not requested during static rendering') },
    onCompletePresentationSegment: () => undefined, onSkipToEnd: () => undefined, onApplyResult: () => undefined, onContinue: () => undefined,
    coachingPlan: createDefaultTacticalPlan(), onApplyCoaching: () => undefined,
    coachingPlayers: homeTeam.rosterPlayerIds.map((playerId) => world.players[playerId]!), coachingTeamId: homeTeam.id, onApplyManualSubstitutions: () => undefined,
  }))
}

describe('MatchViewerScreen workspace UX', () => {
  it('renders one scroll workspace, sticky scoreboard, anchored sections and a match control bar', () => {
    const markup = renderViewer()
    expect(markup).toContain('data-testid="match-viewer-scroll-container"')
    expect(markup).toContain('data-testid="sticky-scoreboard"')
    expect(markup).toContain('data-testid="match-control-bar"')
    expect(markup).toContain('id="match-court"')
    expect(markup).toContain('id="match-stats"')
    expect(markup).toContain('id="match-play-by-play"')
    expect(markup).toContain('MATCH EVENTS')
    expect(markup).toContain('boxscore-player--active')
    expect(markup).not.toContain('Match sections')
  })

  it('keeps real pause, speed, quarter simulation and skip controls in the always available match bar', () => {
    const markup = renderViewer()
    expect(markup).toContain('aria-label="Pause match"')
    expect(markup).toContain('x1')
    expect(markup).toContain('SIM QUARTER')
    expect(markup).toContain('aria-label="Simulate to end of quarter"')
    expect(markup).toContain('SKIP TO END')
    expect(markup).not.toContain('ADVANCE DAY')
    expect(markup).not.toContain('Minimize')
  })

  it('replaces live controls with Continue once the supplied event stream is final', () => {
    const markup = renderViewer(Number.MAX_SAFE_INTEGER, false)
    expect(markup).toContain('CONTINUE')
    expect(markup).not.toContain('SIM QUARTER')
    expect(markup).not.toContain('SKIP TO END')
  })
})
