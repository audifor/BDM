import { expect, it } from 'vitest'
import { parseGameDate } from '@/domain/date'
import { createGame, type Game } from '@/domain/game'
import { updateGameWorld, validateGameWorld, type GameWorld } from '@/domain/world'
import { advanceDayWithTrace, DAILY_LIFECYCLE_PHASE_IDS } from '@/engine/calendar'
import { deserializeGameWorldSaveV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { createConfiguredGame } from './createConfiguredGame'
import { NEW_GAME_UNIVERSES, NCAA_D1_2026_MEN_UNIVERSE_ID, NCAA_D1_2026_WOMEN_UNIVERSE_ID } from './NewGameUniverseCatalog'
import { materializeNcaa2027PostseasonForDay } from './NcaaD1Real2027DailyLifecycle'

const complete = (game: Game): Game => game.status === 'scheduled' ? createGame({
  ...game, status: 'completed', result: { homeScore: 79, awayScore: 70 },
}) : game
const finish = (world: GameWorld, match: (g: Game) => boolean): GameWorld =>
  updateGameWorld(world, { games: Object.values(world.games).map(g => match(g) ? complete(g) : g) })
const source = (gender: 'men' | 'women') => `season:USA:ncaa-d1-${gender}:2026-27`
const conferencePrefix = (gender: 'men' | 'women') => `season:USA:ncaa-d1-${gender}:2027:conference-tournament:`

it.each([
  { id: NCAA_D1_2026_MEN_UNIVERSE_ID, gender: 'men', count: 365 },
  { id: NCAA_D1_2026_WOMEN_UNIVERSE_ID, gender: 'women', count: 363 },
] as const)('opens NEW GAME $gender with all 728 separate real programs, generated people and real ASUN fixtures', ({id,gender,count}) => {
  const option = NEW_GAME_UNIVERSES.find(entry => entry.id === id)!
  expect(option).toBeDefined()
  expect(option.teams).toHaveLength(count)
  expect(option.isTest).toBe(true)
  expect(option.description).toMatch(/generated|BDM-generated/)
  const world = createConfiguredGame({
    universeId: id,userTeamKey:option.teams[0]!.key,ncaaSeed:202627,
    userCoachCreation: {
      firstName: 'NCAA',lastName: 'Manager',dateOfBirth: '1984-06-01',
      gender: gender==='men'?'male':'female',background: 'rookie',
      ambition: 'firstTitle',disposition: 'balanced',coachingStyle: 'balanced',
    },
  })
  expect(Object.values(world.teams)).toHaveLength(728)
  expect(Object.values(world.seasons)).toHaveLength(2)
  expect(world.seasons[source('men') as keyof typeof world.seasons]).toBeDefined()
  expect(world.seasons[source('women') as keyof typeof world.seasons]).toBeDefined()
  expect(world.teams[option.teams[0]!.key as keyof typeof world.teams]!.gender).toBe(gender==='men'?'male':'female')
  expect(world.userCoachId).toBe(world.teams[option.teams[0]!.key as keyof typeof world.teams]!.coachId)
  expect(world.coaches[world.userCoachId]!.firstName).toBe('NCAA')
  expect(world.coachRpgProfilesByCoachId[world.userCoachId]?.creatorOrigin?.background).toBe('rookie')
  const officialASUN = Object.values(world.games).filter(g=>g.id.startsWith('game:USA:ncaa-d1-') && g.id.includes(':2026-27:'))
  expect(officialASUN).toHaveLength(112)
  expect(Object.values(world.games).filter(g=>g.date==='2027-02-27')).not.toHaveLength(0)
  validateGameWorld(world)
  const reopened = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world,'2026-11-01T00:00:00Z'))))
  expect(Object.values(reopened.teams)).toHaveLength(728)
  expect(reopened.userCoachId).toBe(world.userCoachId)
  expect(Object.values(reopened.games)).toHaveLength(Object.values(world.games).length)
},180_000)

it('enters men and women conference tournaments via the canonical March 1 daily phase exactly once', () => {
  const option=NEW_GAME_UNIVERSES.find(item=>item.id===NCAA_D1_2026_MEN_UNIVERSE_ID)!
  let world=createConfiguredGame({universeId:option.id,userTeamKey:option.teams[0]!.key,ncaaSeed:202627})
  world=finish(world,g=>g.seasonId===source('men')||g.seasonId===source('women'))
  world=updateGameWorld(world,{currentDate:parseGameDate('2027-02-28')})
  expect(DAILY_LIFECYCLE_PHASE_IDS).toContain('NCAA_2027_POSTSEASON')
  const advanced=advanceDayWithTrace(world)
  expect(advanced.status).toBe('COMPLETED')
  if(advanced.status!=='COMPLETED')throw Error(advanced.failure?.message)
  const phaseTimes = [...advanced.phases]
    .map(phase => ({ id: phase.phaseId, milliseconds: phase.elapsedMs ?? 0, changed: phase.worldChanged }))
    .sort((a, b) => b.milliseconds - a.milliseconds)
  console.info('NCAA2027_FULL_WORLD_DAILY_PERF', JSON.stringify({
    allPhasesMs: phaseTimes.reduce((sum, phase) => sum + phase.milliseconds, 0),
    slowest: phaseTimes.slice(0, 14),
  }))
  expect(advanced.phases.find(phase => phase.phaseId === 'NCAA_2027_POSTSEASON')?.elapsedMs).toBeGreaterThanOrEqual(0)
  world=advanced.world
  expect(world.currentDate).toBe('2027-03-01')
  expect(advanced.phases.find(p=>p.phaseId==='NCAA_2027_POSTSEASON')?.worldChanged).toBe(true)
  for(const gender of ['men','women'] as const){
    const conferences=Object.keys(world.seasons).filter(id=>id.startsWith(conferencePrefix(gender)))
    expect(conferences).toHaveLength(32)
    expect(Object.values(world.games).some(g=>g.seasonId.startsWith(conferencePrefix(gender)))).toBe(true)
  }
  const again=materializeNcaa2027PostseasonForDay(world)
  expect(again).toBe(world)
  validateGameWorld(world)
},240_000)

it('materializes subsequent 2027 stages from results, retaining dates, gender isolation and Save V4', () => {
  const option=NEW_GAME_UNIVERSES.find(item=>item.id===NCAA_D1_2026_WOMEN_UNIVERSE_ID)!
  let world=createConfiguredGame({universeId:option.id,userTeamKey:option.teams[0]!.key,ncaaSeed:202627})
  world=finish(world,g=>g.seasonId===source('men')||g.seasonId===source('women'))
  world=updateGameWorld(world,{currentDate:parseGameDate('2027-03-01')})
  world=materializeNcaa2027PostseasonForDay(world)
  const first=Object.values(world.games).filter(g=>g.status==='scheduled'&&g.id.startsWith('ncaa2027:conference:'))
  expect(first.length).toBeGreaterThan(50)
  world=finish(world,g=>first.some(f=>f.id===g.id))
  world=updateGameWorld(world,{currentDate:parseGameDate('2027-03-02')})
  const grown=materializeNcaa2027PostseasonForDay(world)
  const remaining=Object.values(grown.games).filter(g=>g.status==='scheduled'&&g.id.startsWith('ncaa2027:conference:'))
  expect(remaining.length).toBeGreaterThan(0)
  expect(remaining.every(g=>g.date>='2027-03-02')).toBe(true)
  expect(remaining.every(g=>grown.competitions[g.competitionId]!.gender===grown.teams[g.homeTeamId]!.gender
    && grown.teams[g.homeTeamId]!.gender===grown.teams[g.awayTeamId]!.gender)).toBe(true)
  expect(materializeNcaa2027PostseasonForDay(grown)).toBe(grown)
  const reload=deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(serializeGameWorldV4(grown,'2027-03-02T00:00:00Z'))))
  expect(Object.values(reload.games)).toHaveLength(Object.values(grown.games).length)
  expect(Object.keys(reload.seasons).length).toBe(66)
},240_000)
