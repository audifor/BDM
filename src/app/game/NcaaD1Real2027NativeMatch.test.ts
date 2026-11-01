import { expect, it } from 'vitest'
import { createConfiguredGame } from './createConfiguredGame'
import { NEW_GAME_UNIVERSES, NCAA_D1_2026_MEN_UNIVERSE_ID, NCAA_D1_2026_WOMEN_UNIVERSE_ID } from './NewGameUniverseCatalog'
import { simulateAndApplyGame } from './matchResolution'
import { validateGameWorld } from '@/domain/world'
import { deserializeGameWorldSaveV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

it.each([
  { id: NCAA_D1_2026_MEN_UNIVERSE_ID, gender: 'male' },
  { id: NCAA_D1_2026_WOMEN_UNIVERSE_ID, gender: 'female' },
] as const)('runs one actual NCAA $gender game through the canonical match engine and Save V4', ({id,gender}) => {
  const selection=NEW_GAME_UNIVERSES.find(item=>item.id===id)!
  const world=createConfiguredGame({universeId:id,userTeamKey:selection.teams[0]!.key,ncaaSeed:202627})
  const season=world.seasons[world.currentSeasonId!]!
  const source=Object.values(world.games).filter(g=>g.seasonId===season.id&&g.status==='scheduled').sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))[0]
  expect(source).toBeDefined()
  expect(world.teams[source!.homeTeamId]!.gender).toBe(gender)
  expect(world.teams[source!.awayTeamId]!.gender).toBe(gender)
  const finished=simulateAndApplyGame(world,source!,202627,undefined,'BACKGROUND')
  const recorded=finished.games[source!.id]
  expect(recorded.status).toBe('completed')
  expect(recorded.result).not.toBeNull()
  expect(recorded.result!.homeScore).not.toBe(recorded.result!.awayScore)
  validateGameWorld(finished)
  const saved=deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(serializeGameWorldV4(finished,'2026-11-01T00:00:00Z'))))
  expect(saved.games[source!.id]).toEqual(recorded)
},180_000)
