import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'
import { createDraftForCompletedSeason, getCurrentDraftPick, openDraft } from '@/engine/draft'
import { applyMatchResult } from '@/engine/match'
import { finalizeSeason } from '@/engine/season'
import { updateGameWorld } from '@/domain/world'

import { transitionFibaPlayerToNba, transitionNbaPlayerToFiba, transitionNcaaPlayerToFiba, transitionNcaaPlayerToNbaDraft } from './EcosystemTransitions'

function teamIn(world: ReturnType<typeof createNewGame>, kind: 'fibaLike' | 'nbaLike' | 'ncaaLike') {
  const competition = Object.values(world.competitions).find((candidate) => world.ecosystems[candidate.ecosystemId]!.kind === kind)!
  return world.teams[competition.participantTeamIds[0]!]!
}

describe('EcosystemTransitions', () => {
  it('uses the existing NBA Draft authority for an NCAA player', () => {
    let world = createNewGame(), nbaSeason = Object.values(world.seasons).find((season) => world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]!.kind === 'nbaLike')!
    for (const game of Object.values(world.games).filter((game) => game.seasonId === nbaSeason.id)) world = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 90, awayScore: 80 })
    world = finalizeSeason(world, nbaSeason.id)
    const ncaa = teamIn(world, 'ncaaLike'), prospects = Object.values(world.teams).filter((team) => Object.values(world.competitions).some((competition) => competition.participantTeamIds.includes(team.id) && world.ecosystems[competition.ecosystemId]!.kind === 'ncaaLike')).flatMap((team) => team.rosterPlayerIds).slice(0, 4)
    const nba = Object.values(world.ecosystems).find((ecosystem) => ecosystem.kind === 'nbaLike')!
    world = updateGameWorld(world, { drafts: [], draftPicks: [], players: Object.values(world.players).filter((player) => !player.id.startsWith('draft-prospect:')) })
    world = createDraftForCompletedSeason(world, nba.id, nbaSeason.id, { rounds: 1, orderMethod: 'reverseStandings', scheduledAfterDays: 1 }, prospects)
    const draft = Object.values(world.draftsById).find((item) => item.sourceSeasonId === nbaSeason.id)!, draftId = draft.id
    world = openDraft(updateGameWorld(world, { currentDate: draft.scheduledOn }), draftId)
    const pick = getCurrentDraftPick(world, draftId)!, playerId = prospects[0]!
    const moved = transitionNcaaPlayerToNbaDraft(world, { id: 'transition:ncaa-nba', playerId, draftId, selectingTeamId: pick.ownerTeamId, toTeamId: pick.ownerTeamId })
    expect(moved.players[playerId]).toBe(world.players[playerId])
    expect(moved.teams[ncaa.id]!.rosterPlayerIds).not.toContain(playerId)
    expect(moved.draftPicksById[pick.id]!.selection?.playerId).toBe(playerId)
    expect(moved.teams[pick.ownerTeamId]!.rosterPlayerIds).toContain(playerId)
  })

  it('moves an NCAA player to FIBA without changing identity or NCAA history', () => {
    const world = createNewGame(), source = teamIn(world, 'ncaaLike'), target = teamIn(world, 'fibaLike'), playerId = source.rosterPlayerIds[0]!
    const nilProfile = Object.values(world.nilProfilesById).find((profile) => profile.playerId === playerId)!
    const moved = transitionNcaaPlayerToFiba(world, { id: 'transition:ncaa-fiba', playerId, toTeamId: target.id, annualSalary: 100_000, contractYears: 2 })

    expect(moved.players[playerId]).toBe(world.players[playerId])
    expect(moved.teams[source.id]!.rosterPlayerIds).not.toContain(playerId)
    expect(moved.teams[target.id]!.rosterPlayerIds).toContain(playerId)
    expect(moved.nilProfilesById[nilProfile.id]).toEqual(nilProfile)
    expect(Object.values(moved.contractsById).filter((contract) => contract.playerId === playerId && contract.teamId === target.id)).toHaveLength(1)
    expect(deserializeGameWorldV1(serializeGameWorldV1(moved, '2032-10-01T00:00:00.000Z')).ecosystemTransitionsById).toEqual(moved.ecosystemTransitionsById)
    expect(transitionNcaaPlayerToFiba(moved, { id: 'transition:ncaa-fiba', playerId, toTeamId: target.id, annualSalary: 100_000, contractYears: 2 })).toEqual(moved)
  })

  it('uses distinct destination contracts for FIBA-to-NBA and NBA-to-FIBA moves', () => {
    const first = createNewGame(), fiba = teamIn(first, 'fibaLike'), nba = teamIn(first, 'nbaLike'), playerId = fiba.rosterPlayerIds[0]!
    const toNba = transitionFibaPlayerToNba(first, { id: 'transition:fiba-nba', playerId, toTeamId: nba.id, annualSalary: 200_000, contractYears: 2 })
    const nbaContract = Object.values(toNba.contractsById).find((contract) => contract.playerId === playerId && contract.teamId === nba.id)!
    expect(toNba.teams[nba.id]!.rosterPlayerIds).toContain(playerId)
    expect(Object.values(toNba.contractsById).some((contract) => contract.playerId === playerId && contract.teamId === fiba.id && contract.termination !== undefined)).toBe(true)

    const fibaDestination = teamIn(toNba, 'fibaLike')
    const back = transitionNbaPlayerToFiba(toNba, { id: 'transition:nba-fiba', playerId, toTeamId: fibaDestination.id, annualSalary: 150_000, contractYears: 1 })
    const fibaContract = Object.values(back.contractsById).find((contract) => contract.playerId === playerId && contract.teamId === fibaDestination.id)!
    expect(fibaContract.id).not.toBe(nbaContract.id)
    expect(back.teams[fibaDestination.id]!.rosterPlayerIds).toContain(playerId)
    expect(Object.values(back.teams).filter((team) => team.rosterPlayerIds.includes(playerId))).toHaveLength(1)
  })
})
