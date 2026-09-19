import { describe, expect, it } from 'vitest'

import { completeMatch, createAcbTestGame, createNewGame, prepareUserMatch } from '@/app/game'
import { getPlayerGameLogs, getPlayerSeasonStats } from '@/engine/stats/PlayerHistory'
import { boxScoreValuation } from '@/engine/stats/boxScoreValuation'
import { getCurrentPlayerContract, getPlayerRosterTeamId } from '@/domain/world'
import { getPlayerAge } from '@/domain/player'
import { DEVELOPMENT_DOMAINS } from '@/domain/player/PlayerDevelopmentProfile'

import { buildPlayerOverviewModel } from './buildPlayerOverviewModel'
import { calendarDaysBetween } from './buildPlayerMedicalModel'
import { DEVELOPMENT_DOMAIN_LABELS } from './buildPlayerDevelopmentModel'
import { defaultPlayerIdForNg } from './buildPlayerWorkspaceModel'

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const

describe('buildPlayerOverviewModel', () => {
  it('returns undefined for a player outside the world', () => {
    const world = createNewGame()
    expect(buildPlayerOverviewModel(world, 'player:missing' as never)).toBeUndefined()
  })

  it('states honest empty readings before any game is played', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const overview = buildPlayerOverviewModel(world, playerId)!

    expect(overview.season.status).toBe('unavailable')
    expect(overview.season.headline).toEqual([])
    expect(overview.season.trendNote).toContain('No game played this season yet')
    expect(overview.season.gamesPlayed).toBe(0)
    expect(overview.recentForm.status).toBe('unavailable')
    expect(overview.recentForm.games).toEqual([])
    // Possession usage is not tracked by the engine: the page must say so, never estimate it.
    expect(overview.identityModule.usage.status).toBe('unavailable')
    expect(overview.identityModule.usage.label).toBe('Not tracked')
    // With no games tracked the note must say so, and never claim a reading it cannot support.
    expect(overview.observationsNote).toBe(
      overview.observations.length === 0
        ? 'No tracked signal yet: observations appear once games are played.'
        : 'Derived from this season’s tracked games and the competition baseline.',
    )
  })

  it('derives the identity module from canonical ratings and the real roster', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const player = world.players[playerId]!
    const overview = buildPlayerOverviewModel(world, playerId)!
    const identity = overview.identityModule

    expect(identity.archetypeTitle.length).toBeGreaterThan(0)
    expect(identity.roleTitle.length).toBeGreaterThan(0)
    expect(identity.chips).toHaveLength(4)
    for (const chip of identity.chips) {
      expect(chip.value).toBe(player.basketball.ratings[chip.id])
    }
    expect(identity.chips.map((chip) => chip.value)).toEqual(
      [...identity.chips.map((chip) => chip.value)].sort((left, right) => right - left),
    )
    expect(identity.rosterSize).toBeGreaterThan(0)
    expect(identity.rosterRank.status).toBe('available')
    expect(identity.rosterRank.value!).toBeGreaterThanOrEqual(1)
    expect(identity.rosterRank.value!).toBeLessThanOrEqual(identity.rosterSize)
    expect(identity.squadRole.status).toBe('available')
    expect(identity.teamName.status).toBe('available')
    const teamId = getPlayerRosterTeamId(world, playerId)
    expect(identity.teamName.value).toBe(teamId === undefined ? 'Free agent' : world.teams[teamId]!.name)
  })

  it('reports age and the scouting potential range, never a hidden ceiling', () => {
    const world = createAcbTestGame()
    const playerId = Object.keys(world.players)[0] as never
    const player = world.players[playerId]!
    const pulse = buildPlayerOverviewModel(world, playerId)!.developmentPulse
    const serialized = JSON.stringify(pulse)

    expect(pulse.ageLabel).toBe(String(getPlayerAge(world, playerId)))
    for (const domain of DEVELOPMENT_DOMAINS) {
      expect(serialized).not.toContain(String(player.development.ceilings[domain]))
    }

    if (pulse.potentialStatus === 'available') {
      // "<range> · <domain>": a scouting range with its source, never a bare figure.
      const [range, domainLabel] = pulse.potentialLabel.split(' · ')
      expect(domainLabel).toBeDefined()
      expect(Object.values(DEVELOPMENT_DOMAIN_LABELS)).toContain(domainLabel)
      expect(range!.length).toBeGreaterThan(0)
      expect(pulse.potentialNote).toContain('never shown as exact values')
    } else {
      expect(pulse.potentialLabel).toBe('Not scouted')
      expect(pulse.potentialNote).toContain('No scouting potential evaluation')
    }
  })

  it('states which slice of the season the form bars cover', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const recentForm = buildPlayerOverviewModel(updated, playerId)!.recentForm

    expect(recentForm.windowLabel).toBe('1 game')
    const idle = buildPlayerOverviewModel(world, defaultPlayerIdForNg(world)!)!
    expect(idle.recentForm.windowLabel).toBe('No games tracked yet')
  })

  it('reads the season snapshot from the tracked game log once a game is played', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const overview = buildPlayerOverviewModel(updated, playerId)!
    const stats = getPlayerSeasonStats(updated, playerId, updated.currentSeasonId)

    expect(stats.gamesPlayed).toBeGreaterThan(0)
    expect(overview.season.status).toBe('available')
    expect(overview.season.gamesPlayed).toBe(stats.gamesPlayed)
    expect(overview.season.headline.map((stat) => stat.label)).toEqual([
      'PTS',
      'REB',
      'AST',
      'STL',
      'BLK',
      'VAL',
    ])
    expect(overview.season.secondary.map((stat) => stat.label)).toEqual([
      'FG%',
      '3P%',
      'FT%',
      'TS%',
      'eFG%',
    ])
    // Every stat cell has its own per-game curve: selecting one re-plots the chart.
    expect(overview.season.trends.map((trend) => trend.id)).toEqual(
      expect.arrayContaining(['pts', 'reb', 'ast', 'stl', 'blk', 'val']),
    )
    const valuation = overview.season.trends.find((trend) => trend.id === 'val')!
    expect(valuation.points).toHaveLength(1)
    expect(valuation.points[0]).toBe(
      boxScoreValuation(updated.matchStatLogsByGameId[simulation.gameId]!.playerLines.find(
        (line) => line.playerId === playerId,
      )!.stats),
    )
    expect(valuation.average).toBe(Number(overview.season.headline[5]!.value))
    expect(valuation.label).toBe(overview.season.headline[5]!.label)
    for (const trend of overview.season.trends) {
      expect(trend.points).toHaveLength(overview.season.gamesPlayed)
      expect(trend.label.length).toBeGreaterThan(0)
    }
    const gameLine = updated.matchStatLogsByGameId[simulation.gameId]!.playerLines.find(
      (line) => line.playerId === playerId,
    )!.stats
    const scoring = overview.season.trends.find((trend) => trend.id === 'pts')!
    // The series mirrors the tracked game log, oldest first, one point per game.
    expect(scoring.points).toEqual(
      getPlayerGameLogs(updated, playerId)
        .filter((line) => line.seasonId === updated.currentSeasonId)
        .reverse()
        .map((line) => line.stats.points),
    )
    expect(gameLine.points).toBeGreaterThan(0)
    expect(scoring.average).toBe(Number(overview.season.headline[0]!.value))
    const freeThrows = overview.season.trends.find((trend) => trend.id === 'ft')
    if (freeThrows !== undefined) {
      // A game with no attempt is unknown, never a zero reading.
      expect(freeThrows.points[0]).toBe(
        gameLine.freeThrowsAttempted === 0
          ? null
          : (gameLine.freeThrowsMade / gameLine.freeThrowsAttempted) * 100,
      )
    }
    expect(overview.season.trendNote).toContain('Per-game values across')
  })

  it('declares the readings the engine cannot support instead of approximating them', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const overview = buildPlayerOverviewModel(world, playerId)!

    for (const gaps of [overview.identityModule.gaps, overview.season.gaps]) {
      expect(gaps.length).toBeGreaterThan(0)
      for (const gap of gaps) {
        expect(gap.label.length).toBeGreaterThan(0)
        expect(gap.reason.length).toBeGreaterThan(0)
      }
    }
    expect(overview.season.gaps.map((gap) => gap.label)).toContain('USG%')
    expect(overview.identityModule.gaps.map((gap) => gap.label)).toContain('Usage')
  })

  it('draws at most three rating curves, all of them backed by real values', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const player = world.players[playerId]!
    const pulse = buildPlayerOverviewModel(world, playerId)!.developmentPulse

    expect(pulse.series.length).toBeGreaterThan(0)
    expect(pulse.series.length).toBeLessThanOrEqual(3)
    for (const entry of pulse.series) {
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.points.length).toBeGreaterThan(0)
      expect(player.basketball.ratings[entry.id]).toBe(entry.points[entry.points.length - 1])
    }
    expect(pulse.seriesNote).toContain('Rating evolution starts at the first offseason transition')
  })

  it('builds recent form bars relative to the best game in the window', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const overview = buildPlayerOverviewModel(updated, playerId)!

    expect(overview.recentForm.status).toBe('available')
    expect(overview.recentForm.games).toHaveLength(1)
    const game = overview.recentForm.games[0]!
    expect(game.points).toBeGreaterThanOrEqual(0)
    expect(game.minutes).toBeGreaterThanOrEqual(0)
    expect(game.height).toBeGreaterThanOrEqual(0)
    expect(game.height).toBeLessThanOrEqual(100)
    expect(game.opponent.length).toBeGreaterThan(0)
    expect(overview.recentForm.averageLabel).toContain('Season average')
  })

  it('never returns more observations than the cap and explains the empty case', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const overview = buildPlayerOverviewModel(world, playerId)!

    expect(overview.observations.length).toBeLessThanOrEqual(5)
    for (const observation of overview.observations) {
      expect(observation.label.length).toBeGreaterThan(0)
      expect(observation.detail.length).toBeGreaterThan(0)
    }
  })

  it('reports the competition baseline as a real family mean', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const overview = buildPlayerOverviewModel(world, playerId)!
    const leagueReading = overview.observations.find(
      (observation) => observation.id === 'league-strength',
    )

    expect(leagueReading).toBeDefined()
    expect(leagueReading!.detail).toMatch(/competition mean of \d+\.\d/)
  })

  it('keeps alerts tagged, non-empty and ordered by severity', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const alerts = buildPlayerOverviewModel(world, playerId)!.alerts

    expect(alerts.length).toBeGreaterThan(0)
    for (const alert of alerts) {
      expect(alert.tag.length).toBeGreaterThan(0)
      expect(alert.detail.length).toBeGreaterThan(0)
    }
    const severities = alerts.map((alert) => SEVERITY_ORDER[alert.severity])
    expect(severities).toEqual([...severities].sort((left, right) => left - right))
  })

  it('counts the contract countdown from the raw term, not from a display label', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const overview = buildPlayerOverviewModel(world, playerId)!
    const raw = getCurrentPlayerContract(world, playerId)!

    expect(overview.contractPulse.status).toBe('available')
    expect(overview.contractPulse.daysToExpiry).toBe(
      calendarDaysBetween(world.currentDate, raw.term.expiresOn),
    )
    expect(Number.isInteger(overview.contractPulse.daysToExpiry!)).toBe(true)
    expect(overview.contractPulse.message).toBeNull()
  })

  it('explains the missing contract instead of leaving the pulse blank', () => {
    const world = createAcbTestGame()
    const overviews = Object.keys(world.players)
      .map((playerId) => buildPlayerOverviewModel(world, playerId as never))
      .filter((overview) => overview !== undefined)
      .map((overview) => overview!.contractPulse)

    const withoutContract = overviews.filter((pulse) => pulse.status === 'unavailable')
    expect(overviews.length).toBeGreaterThan(0)
    for (const pulse of withoutContract) {
      expect(pulse.message).not.toBeNull()
      expect(pulse.daysToExpiry).toBeNull()
      expect(pulse.endDateLabel).toBeNull()
    }
    for (const pulse of overviews.filter((entry) => entry.status === 'available')) {
      expect(pulse.message).toBeNull()
      expect(pulse.daysToExpiry).not.toBeNull()
    }
  })

  it('emits unique milestones and always includes the current season', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const timeline = buildPlayerOverviewModel(updated, playerId)!.timeline

    expect(timeline.some((node) => node.id === 'current-season')).toBe(true)
    expect(timeline.some((node) => node.id === 'first-game')).toBe(true)
    expect(new Set(timeline.map((node) => node.id)).size).toBe(timeline.length)
  })

  it('reports the medical pulse from the real availability and fatigue state', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const pulse = buildPlayerOverviewModel(world, playerId)!.medicalPulse

    expect(pulse.availabilityLabel.length).toBeGreaterThan(0)
    expect(pulse.fatigueLabel).toMatch(/^\d+%$/)
  })

  it('labels every trend point and fills the form window with the reference slots', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const overview = buildPlayerOverviewModel(updated, playerId)!

    expect(overview.season.trendLabels).toHaveLength(overview.season.gamesPlayed)
    expect(overview.season.trendLabels[0]).toBe('G1')
    for (const trend of overview.season.trends) {
      expect(trend.points).toHaveLength(overview.season.trendLabels.length)
    }
    // The design draws five slots: the played games plus the empty future ones.
    expect(overview.recentForm.slots).toBe(5)
    expect(overview.recentForm.games.length).toBeLessThanOrEqual(overview.recentForm.slots)
    for (const game of overview.recentForm.games) {
      expect(game.dateLabel).not.toBeNull()
    }

    // Each bar carries that game's full box score, for the hover card.
    expect(overview.recentForm.games.length).toBeGreaterThan(0)
    for (const game of overview.recentForm.games) {
      expect(game.figures.map((figure) => figure.label)).toEqual(
        expect.arrayContaining([
          'MIN',
          'PTS',
          'REB',
          'AST',
          'STL',
          'BLK',
          'TOV',
          'FG',
          '3P',
          'FT',
          'TS%',
          'eFG%',
          'VAL',
        ]),
      )
      const line = updated.matchStatLogsByGameId[game.id as never]!.playerLines.find(
        (entry) => entry.playerId === playerId,
      )!.stats
      const figure = (label: string) =>
        game.figures.find((entry) => entry.label === label)!.value
      expect(figure('PTS')).toBe(String(line.points))
      expect(figure('MIN')).toBe(String(Math.round(line.secondsPlayed / 60)))
      expect(figure('FG')).toBe(`${line.fieldGoalsMade}/${line.fieldGoalsAttempted}`)
      // An unknown percentage is stated, never printed as a zero.
      expect(figure('FT%')).toBe(
        line.freeThrowsAttempted === 0
          ? '—'
          : ((line.freeThrowsMade / line.freeThrowsAttempted) * 100).toFixed(1),
      )
    }
  })

  it('dates every alert, hands over the ones that need a decision, and states the clear case', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const alerts = buildPlayerOverviewModel(world, playerId)!.alerts

    expect(alerts.length).toBeGreaterThan(0)
    for (const alert of alerts) {
      expect(alert.dateLabel.length).toBeGreaterThan(0)
      // An action, or the honest absence of one: never a dead button.
      expect(alert.action === null || alert.action.label.length > 0).toBe(true)
    }
    const clear = alerts.find((alert) => alert.id === 'all-clear')
    if (clear !== undefined) {
      expect(clear.action).toBeNull()
    } else {
      expect(alerts.some((alert) => alert.action !== null)).toBe(true)
    }
  })

  it('states a timeline stage per node and only promises an end date a contract really has', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const overview = buildPlayerOverviewModel(world, playerId)!
    const contract = getCurrentPlayerContract(world, playerId)

    for (const node of overview.timeline) {
      expect(['past', 'current', 'future']).toContain(node.state)
      expect(node.dateLabel).not.toBeNull()
    }
    expect(overview.timeline.filter((node) => node.state === 'current')).toHaveLength(1)

    const end = overview.timeline.find((node) => node.id === 'contract-end')
    if (contract === undefined) {
      expect(end).toBeUndefined()
    } else {
      expect(end?.state).toBe('future')
    }
  })

  it('labels the rating evolution with the seasons it actually samples', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const pulse = buildPlayerOverviewModel(world, playerId)!.developmentPulse

    // One label per recorded transition plus the season in progress, all of them real season labels.
    expect(pulse.seasonLabels.length).toBeGreaterThan(0)
    for (const label of pulse.seasonLabels) {
      expect(label.length).toBeGreaterThan(0)
    }
  })

  it('is deterministic for the same world state', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    expect(buildPlayerOverviewModel(world, playerId)).toEqual(
      buildPlayerOverviewModel(world, playerId),
    )
  })
})
