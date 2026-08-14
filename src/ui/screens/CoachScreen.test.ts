import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { applyMatchResult } from '@/engine/match'
import { coachReputationBandLabel, coachReputationSourceLabel, formatCoachReputationDelta } from '@/ui/coachReputationPresentation'

import { CoachScreen } from './CoachScreen'

describe('CoachScreen reputation', () => {
  it('renders four reputation dimensions, derived bands and an empty event state', () => {
    const markup = renderToStaticMarkup(createElement(CoachScreen, { world: createNewGame(), onSkill: () => undefined, onPerk: () => undefined }))

    expect(markup).toContain('REPUTATION')
    expect(markup).toContain('Competitive')
    expect(markup).toContain('Development')
    expect(markup).toContain('Professional')
    expect(markup).toContain('Public Standing')
    expect(markup).toContain('Established')
    expect(markup).toContain('200 / 1000')
    expect(markup).toContain('RECENT REPUTATION CHANGES')
    expect(markup).toContain('No reputation changes yet.')
    expect(markup).not.toContain('Overall Reputation')
  })

  it('renders recent match changes with context and signed deltas', () => {
    const world = createNewGame()
    const userTeam = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!
    const game = Object.values(world.games).find((candidate) => candidate.homeTeamId === userTeam.id)!
    const updated = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 82, awayScore: 76 })
    const markup = renderToStaticMarkup(createElement(CoachScreen, { world: updated, onSkill: () => undefined, onPerk: () => undefined }))

    expect(markup).toContain(`Win vs ${updated.teams[game.awayTeamId]!.name}`)
    expect(markup).toContain('Match Result')
    expect(markup).toContain('+')
  })

  it('formats presentation metadata without duplicating domain thresholds', () => {
    expect(coachReputationBandLabel('respected')).toBe('Respected')
    expect(coachReputationBandLabel('legendary')).toBe('Legendary')
    expect(coachReputationSourceLabel('matchResult')).toBe('Match Result')
    expect(coachReputationSourceLabel('seasonAchievement')).toBe('Season Achievement')
    expect(formatCoachReputationDelta(8)).toBe('+8')
    expect(formatCoachReputationDelta(-6)).toBe('-6')
  })
})
