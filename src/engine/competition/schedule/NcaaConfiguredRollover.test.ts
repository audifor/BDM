import { expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { startNextSeasonFor } from '@/app/game/startNextSeason'
import { createSeason } from '@/domain/season'
import { updateGameWorld } from '@/domain/world'
import { createGame } from '@/domain/game'
import { finalizeSeason } from '@/engine/season'
import { generateNcaaConfiguredSchedule } from './NcaaLikeSchedule'
import { serializeGameWorldV4, deserializeGameWorldSaveV4 } from '@/save/GameWorldSaveV4'

it('retains the configured policy across Save V4 and generates the next edition', () => {
  let world = createNewGame()
  const original = Object.values(world.seasons).find(s => world.ecosystems[world.competitions[s.competitionId]!.ecosystemId]?.kind === 'ncaaLike')!
  const memberships = original.conferenceMembershipSnapshot ?? world.conferenceMemberships.filter(m => m.seasonId === original.id)
  const policy = { seed: 314, nonConferenceRounds: 2, conferenceGamesPerTeam: Object.fromEntries(memberships.map(m => [m.conferenceId, 2])) }
  const season = createSeason({ ...original, ncaaSchedulePolicy: policy })
  world = updateGameWorld(world, { seasons: Object.values(world.seasons).map(s => s.id === season.id ? season : s) })
  const games = generateNcaaConfiguredSchedule(world, season.id, policy).map(g => createGame({ ...g, status: 'completed', result: { homeScore: 80, awayScore: 70 } }))
  world = updateGameWorld(world, { games: [...Object.values(world.games).filter(g => g.seasonId !== season.id), ...games] })
  world = finalizeSeason(world, season.id)
  world = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, '2026-10-31T09:00:00Z'))))
  const rolled = startNextSeasonFor(world, season.id)
  const successor = Object.values(rolled.seasons).find(s => s.competitionId === season.competitionId && s.id !== season.id)!
  expect(successor.ncaaSchedulePolicy).toEqual(policy)
  const generated = Object.values(rolled.games).filter(g => g.seasonId === successor.id)
  expect(generated.length).toBeGreaterThan(0)
  expect(generated).toEqual(generateNcaaConfiguredSchedule(rolled, successor.id, policy))
})
