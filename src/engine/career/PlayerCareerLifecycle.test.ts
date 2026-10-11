import { assignLineupSlot } from '@/domain/tactics'
import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { createGameDate } from '@/domain/date'
import { getFreeAgents, updateGameWorld } from '@/domain/world'
import { endPlayerCareer, isPlayerCareerActive, progressPlayerCareerEnds } from './PlayerCareerLifecycle'
import { progressAnnualTalentSupply } from '@/engine/world/AnnualTalentSupply'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'

describe('BS15I career end and annual population continuity', () => {
  it('actually retires over-age Players and terminates future professional obligations', () => {
    const base = createNewGame()
    const contract = Object.values(base.contractsById)[0]!
    const player = base.players[contract.playerId]!
    const dated = updateGameWorld(base, {
      playerRights: [...Object.values(base.playerRightsById), { id: 'career-end-rights', playerId: player.id, ownerTeamId: contract.teamId, ecosystemId: Object.values(base.competitions).find(item => item.participantTeamIds.includes(contract.teamId))!.ecosystemId, rightsType: 'draft', acquiredAt: base.currentDate, status: 'active' }],
      lineupsByTeamId: { ...base.lineupsByTeamId, [contract.teamId]: assignLineupSlot(base.lineupsByTeamId[contract.teamId]!, 'PG', player.id) },
      players: Object.values(base.players).map(item => item.id === player.id ? { ...item, bio: { ...item.bio, dateOfBirth: createGameDate(1980, 1, 1) } } : item),
      contracts: Object.values(base.contractsById).map(item => item.id === contract.id ? { ...item, term: { startsOn: createGameDate(2033, 1, 1), expiresOn: createGameDate(2034, 1, 1) } } : item),
    })
    const ended = progressPlayerCareerEnds(dated)
    expect(ended.players[player.id]!.careerEnd?.reason).toBe('ageLimit')
    expect(ended.contractsById[contract.id]!.termination?.reason).toBe('retired')
    expect(ended.lineupsByTeamId[contract.teamId]!.starters.PG).toBeUndefined()
    expect(ended.playerRightsById['career-end-rights']).toMatchObject({ status: 'expired', expiresAt: base.currentDate })
    expect(Object.values(ended.teams).some(team => team.rosterPlayerIds.includes(player.id))).toBe(false)
    expect(progressPlayerCareerEnds(ended)).toBe(ended)
  })
  it('ends a sporting career while preserving Player and Person identity and save semantics', () => {
    const base = createNewGame()
    const player = Object.values(base.players)[0]!
    const person = base.personsById[player.personId!]!
    const team = Object.values(base.teams).find((item) => item.rosterPlayerIds.includes(player.id))!
    const ended = endPlayerCareer(base, player.id, 'manual')

    expect(isPlayerCareerActive(ended, player.id)).toBe(false)
    expect(ended.players[player.id]!.personId).toBe(person.id)
    expect(ended.personsById[person.id]).toEqual(person)
    expect(ended.teams[team.id]!.rosterPlayerIds).not.toContain(player.id)
    expect(getFreeAgents(ended).some((item) => item.id === player.id)).toBe(false)
    expect(endPlayerCareer(ended, player.id)).toBe(ended)

    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(ended, '2032-10-01T00:00:00.000Z'))
    expect(reloaded.players[player.id]!.careerEnd).toEqual(ended.players[player.id]!.careerEnd)
    expect(reloaded.personsById[person.id]).toEqual(person)
  })

  it('creates repeatable yearly age cohorts without materializing candidates', () => {
    const base = createNewGame()
    const dated = updateGameWorld(base, { currentDate: createGameDate(2033, 7, 1) })
    const first = progressAnnualTalentSupply(dated)
    const repeated = progressAnnualTalentSupply(first)
    const countryIds = new Set(Object.values(base.players).map((player) => player.nationalityId))

    const newCohorts = Object.values(first.talentCohortsById).filter((cohort) => cohort.generationYear === 2033)
    expect(newCohorts).toHaveLength(countryIds.size * 2)
    expect(Object.keys(repeated.talentCohortsById)).toEqual(Object.keys(first.talentCohortsById))
    expect(Object.keys(first.talentMaterializationsByCandidateKey)).toHaveLength(0)
    expect(newCohorts.every((cohort) => cohort.birthYear === 2015 && cohort.candidateCapacity > 0)).toBe(true)
  })

  it('age-end pass is idempotent and leaves younger careers active', () => {
    const world = createNewGame()
    const player = Object.values(world.players)[0]!
    const ended = endPlayerCareer(world, player.id, 'ageLimit')
    const progressed = progressPlayerCareerEnds(ended)
    expect(progressed).toBe(ended)
    expect(isPlayerCareerActive(world, player.id)).toBe(true)
  })
})
