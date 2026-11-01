import { expect, it } from 'vitest'
import { generateWorld } from '@/engine/world'
import { createGame } from '@/domain/game'
import { resolveWorldCompetitionAggregate } from './WorldCompetitionAggregate'
import { parseWorldCompetitionFormatDocument } from '@/domain/competition'
import formats from '@/data/worlddb-v2/global-formats.json'

it('keeps two-leg aggregate totals, schedules only a tied decider, and honors the higher seed venue', () => {
  let world = generateWorld({ seed: 7, gender: 'male' })
  const season = world.seasons[world.currentSeasonId]!
  const format = parseWorldCompetitionFormatDocument(formats.find(f => f.competition_id === 'competition:ESP:lf-endesa')!)
  world = { ...world, games: {}, seasons: { ...world.seasons, [season.id]: { ...season, worldCompetitionFormat: format, calendarPolicy: undefined } } }
  const teams = Object.values(world.teams).slice(0, 2)
  const node = format.variants[0]!.nodes.find(n => n.key === 'QUARTERFINALS')!
  const fixture = { fixtureId: 'test:aggregate', competitionSeasonId: format.competitionSeasonId, variantKey: 'MAIN', nodeKey: node.key, fixtureOrder: 1,
    participants: [{ competitionSeasonEntryId: teams[0]!.id, seed: 1 }, { competitionSeasonEntryId: teams[1]!.id, seed: 8 }] as const }
  const first = resolveWorldCompetitionAggregate(world, season.id, fixture, node).next!
  expect(first.homeTeamId).toBe(teams[1]!.id)
  world = { ...world, games: { [first.id]: createGame({ ...first, status: 'completed', result: { homeScore: 80, awayScore: 70 } }) } }
  const second = resolveWorldCompetitionAggregate(world, season.id, fixture, node).next!
  expect(second.homeTeamId).toBe(teams[0]!.id)
  world = { ...world, games: { ...world.games, [second.id]: createGame({ ...second, status: 'completed', result: { homeScore: 85, awayScore: 75 } }) } }
  const tie = resolveWorldCompetitionAggregate(world, season.id, fixture, node)
  expect(tie.outcome).toBeNull()
  expect(tie.next?.postseasonGameNo).toBe(3)
  expect(tie.next?.homeTeamId).toBe(teams[0]!.id)
  const decided = { ...world, games: { ...world.games, [second.id]: createGame({ ...second, status: 'completed', result: { homeScore: 86, awayScore: 75 } }) } }
  expect(resolveWorldCompetitionAggregate(decided, season.id, fixture, node)).toMatchObject({ outcome: { winnerEntryId: teams[0]!.id }, next: null })
  world = { ...world, games: { ...world.games, [tie.next!.id]: createGame({ ...tie.next!, status: 'completed', result: { homeScore: 80, awayScore: 81 } }) } }
  expect(resolveWorldCompetitionAggregate(world, season.id, fixture, node)).toMatchObject({ outcome: { winnerEntryId: teams[1]!.id }, next: null })
})
