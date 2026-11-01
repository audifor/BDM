import { expect, it } from 'vitest'
import { createGame, type Game } from '@/domain/game'
import { updateGameWorld, validateGameWorld, withSingleWorldValidation, type GameWorld } from '@/domain/world'
import { deserializeGameWorldSaveV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import source from '@/data/worlddb-v2/ncaa-d1-2026-27-official-fixtures-sample.json'
import { buildNcaaD1Real2026ConferenceSnapshot, type NcaaD1RealGender } from './NcaaD1Real2026Conferences'
import { ncaaD1Real2026GameplayPolicy } from './NcaaD1Real2026GeneratedPolicy'
import type { NcaaD1Real2026FixtureSource } from './NcaaD1Real2026Fixtures'
import { createNcaaD1Real2026WorldSeed } from './NcaaD1Real2026WorldSeed'
import { startNcaa2027ConferenceTournaments, advanceNcaa2027ConferenceTournament, getNcaa2027ConferenceChampions } from './NcaaD1Real2027ConferenceTournaments'
import { selectNcaa2027Field, startNcaa2027NationalTournament, advanceNcaa2027NationalTournament, getNcaa2027NationalChampion, ncaa2027NationalFormatSummary } from './NcaaD1Real2027NationalTournament'

const fullScore = (game: Game): Game => game.status === 'scheduled'
  ? createGame({ ...game, status: 'completed', result: { homeScore: 79, awayScore: 70 } })
  : game
const finish = (world: GameWorld, games: readonly Game[]): GameWorld => {
  const replacements = new Map(games.map(game => [game.id, fullScore(game)]))
  return updateGameWorld(world, { games: Object.values(world.games).map(game => replacements.get(game.id) ?? game) })
}

it.each(['men','women'] as const)(
  'runs 32 %s conference champions, selects 32+44, resolves 12+63 national Games, preserves source matches and Save V4',
  gender => {
    const cohort = buildNcaaD1Real2026ConferenceSnapshot(gender)
    const documented = (source.fixtures as NcaaD1Real2026FixtureSource[]).filter(f => f.gender === gender)
    const policy = ncaaD1Real2026GameplayPolicy(gender,202627)
    const started = createNcaaD1Real2026WorldSeed({
      gender,seed:202627,managedProgramId:String(cohort.teams[0]!.id),
      sourcedFixtures:documented,generatedSchedule:policy,
    })
    const original = Object.values(started.world.games)
    let world = finish(started.world,original)
    const expectedOfficial=new Map(documented.map(game=>[
      Object.values(started.sourceEvidenceByGameId).find(e=>e.url===game.sourceUrl)?.url,game.date,
    ]))
    expect(expectedOfficial.size).toBeGreaterThan(0)
    world=startNcaa2027ConferenceTournaments(world,gender)
    const confs=cohort.conferences.map(c=>c.id)
    const initialTournaments=Object.values(world.seasons).filter(s=>s.label.includes('BDM simulated postseason'))
    expect(initialTournaments).toHaveLength(32)
    for(let iteration=0;iteration<8;iteration++){
      const pending=Object.values(world.games).filter(g=>g.status==='scheduled'&&g.id.startsWith('ncaa2027:conference:'))
      if(pending.length===0)break
      world=finish(world,pending)
      world=withSingleWorldValidation(world, current=>{
        for(const conferenceId of confs) current=advanceNcaa2027ConferenceTournament(current,gender,conferenceId)
        return current
      })
    }
    const champions=getNcaa2027ConferenceChampions(world,gender)
    expect(champions).toHaveLength(32)
    expect(new Set(champions).size).toBe(32)
    const simulatedConferenceGames=Object.values(world.games).filter(g=>g.id.startsWith('ncaa2027:conference:'))
    expect(simulatedConferenceGames).toHaveLength(cohort.teams.length-32)
    expect(simulatedConferenceGames.every(g=>g.status==='completed')).toBe(true)
    const field=selectNcaa2027Field(world,gender)
    expect(field.automatic).toHaveLength(32)
    expect(field.atLarge).toHaveLength(44)
    expect(field.seeded).toHaveLength(76)
    expect(new Set(field.seeded).size).toBe(76)
    expect(field.automatic.every(id=>field.seeded.includes(id))).toBe(true)
    world=startNcaa2027NationalTournament(world,gender)
    const nationalId=`season:USA:ncaa-d1-${gender}:2027:national-championship`
    for(const [round,count] of Object.entries({
      OPENING_ROUND:12,FIRST_ROUND:32,SECOND_ROUND:16,SWEET_16:8,ELITE_EIGHT:4,FINAL_FOUR:2,FINAL:1,
    })){
      const pending=Object.values(world.games).filter(g=>g.seasonId===nationalId&&g.competitionStageKey===round&&g.status==='scheduled')
      expect(pending).toHaveLength(count)
      expect(new Set(pending.flatMap(g=>[g.homeTeamId,g.awayTeamId])).size).toBe(count*2)
      expect(pending.every(g=>world.teams[g.homeTeamId]!.gender===(gender==='men'?'male':'female')&&world.teams[g.awayTeamId]!.gender===(gender==='men'?'male':'female'))).toBe(true)
      world=finish(world,pending)
      world=advanceNcaa2027NationalTournament(world,gender)
    }
    expect(getNcaa2027NationalChampion(world,gender)).toBeDefined()
    expect(Object.values(world.games).filter(g=>g.seasonId===nationalId)).toHaveLength(75)
    const summary=ncaa2027NationalFormatSummary(gender)
    expect(summary.roundGameCounts).toEqual([12,32,16,8,4,2,1])
    for(const game of original)expect(world.games[game.id]).toEqual(fullScore(game))
    validateGameWorld(world)
    const recovered=deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world,'2026-11-01T00:00:00Z'))))
    expect(getNcaa2027NationalChampion(recovered,gender)).toBe(getNcaa2027NationalChampion(world,gender))
    expect(getNcaa2027ConferenceChampions(recovered,gender)).toEqual(champions)
    expect(Object.values(recovered.games).filter(g=>g.seasonId===nationalId)).toHaveLength(75)
    expect(recovered.seasons[cohort.seasonId]?.ncaaSchedulePolicy).toEqual(policy)
  },600_000,
)
