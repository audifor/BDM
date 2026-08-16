import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { advanceDay } from '@/engine/calendar'
import { calculateStandings } from '@/engine/competition/standings'
import { applyMatchResult } from '@/engine/match'
import { finalizeSeason } from '@/engine/season'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'

import { chooseAiDraftProspect, createDraftForCompletedSeason, generateDraftProspects, getAvailableDraftProspects, getCurrentDraftPick, getDraftPicks, makeDraftSelection, openDraft, progressDraftAi } from './DraftEngine'

describe('DraftEngine', () => {
  it('uses canonical reverse standings and configurable rounds', () => {
    const { world, draftId, seasonId } = createOpenDraftWorld(2)
    const reverseStandings = calculateStandings(world, seasonId).map((line) => line.teamId).reverse()
    const oneRound = createOpenDraftWorld(1)
    const threeRounds = createOpenDraftWorld(3)

    expect(getDraftPicks(world, draftId).map((pick) => pick.originalTeamId)).toEqual([...reverseStandings, ...reverseStandings])
    expect(getDraftPicks(oneRound.world, oneRound.draftId)).toHaveLength(4)
    expect(getDraftPicks(threeRounds.world, threeRounds.draftId)).toHaveLength(12)
  })

  it('pauses for the user, honors transferable-pick ownership, and resumes to completion', () => {
    const initial = createOpenDraftWorld(1)
    const userTeamId = Object.values(initial.world.teams).find((team) => team.coachId === initial.world.userCoachId)!.id
    const picks = getDraftPicks(initial.world, initial.draftId)
    let world = openDraft(updateGameWorld(initial.world, { currentDate: initial.world.draftsById[initial.draftId]!.scheduledOn, draftPicks: picks.map((pick, index) => index === 1 ? { ...pick, ownerTeamId: userTeamId } : pick) }), initial.draftId)

    world = progressDraftAi(world, initial.draftId)
    expect(getDraftPicks(world, initial.draftId).map((pick) => pick.selection?.playerId)).toEqual([expect.any(String), undefined, undefined, undefined])
    const userPick = getCurrentDraftPick(world, initial.draftId)!
    expect(userPick.originalTeamId).not.toBe(userPick.ownerTeamId)
    const selected = getAvailableDraftProspects(world, initial.draftId)[0]!
    expect(() => makeDraftSelection(world, initial.draftId, userPick.originalTeamId, selected)).toThrow('Draft selection is invalid')

    world = makeDraftSelection(world, initial.draftId, userTeamId, selected)
    expect(world.teams[userTeamId]!.rosterPlayerIds).toContain(selected)
    expect(Object.values(world.contractsById).filter((contract) => contract.playerId === selected && contract.teamId === userTeamId)).toHaveLength(1)
    expect(() => makeDraftSelection(world, initial.draftId, userTeamId, selected)).toThrow('Draft selection is invalid')
    expect(getAvailableDraftProspects(world, initial.draftId)).not.toContain(selected)

    world = progressDraftAi(world, initial.draftId)
    expect(world.draftsById[initial.draftId]!.status).toBe('completed')
    expect(getCurrentDraftPick(world, initial.draftId)).toBeUndefined()
    expect(() => makeDraftSelection(world, initial.draftId, userTeamId, getAvailableDraftProspects(world, initial.draftId)[0]!)).toThrow('Draft is not in progress')
  })

  it('opens and progresses through advanceDay while the FIBA-like competition remains active', () => {
    const { world, draftId } = createOpenDraftWorld(1)
    const advanced = advanceDay(world)

    expect(advanced.draftsById[draftId]!.status).toBe('completed')
    expect(Object.values(advanced.competitions).some((competition) => advanced.ecosystems[competition.ecosystemId]!.kind === 'fibaLike' && Object.values(advanced.games).some((game) => game.competitionId === competition.id && game.status === 'scheduled'))).toBe(true)
    expect(Object.keys(advanceDay(createNewGame()).draftsById)).toEqual([])
  })

  it('is deterministic and persists an in-progress user-paused draft without regeneration', () => {
    const initial = createOpenDraftWorld(1)
    const userTeamId = Object.values(initial.world.teams).find((team) => team.coachId === initial.world.userCoachId)!.id
    let world = openDraft(updateGameWorld(initial.world, { currentDate: initial.world.draftsById[initial.draftId]!.scheduledOn, draftPicks: getDraftPicks(initial.world, initial.draftId).map((pick, index) => index === 1 ? { ...pick, ownerTeamId: userTeamId } : pick) }), initial.draftId)
    const firstChoice = chooseAiDraftProspect(world, initial.draftId)
    expect(chooseAiDraftProspect(world, initial.draftId)).toBe(firstChoice)
    world = progressDraftAi(world, initial.draftId)

    const loaded = deserializeGameWorldV1(serializeGameWorldV1(world, '2033-06-01T00:00:00.000Z'))
    expect(loaded.draftsById).toEqual(world.draftsById)
    expect(loaded.draftPicksById).toEqual(world.draftPicksById)
    expect(loaded.players).toEqual(world.players)
    expect(loaded.teams).toEqual(world.teams)
    expect(getAvailableDraftProspects(loaded, initial.draftId)).toEqual(getAvailableDraftProspects(world, initial.draftId))
    expect(getCurrentDraftPick(loaded, initial.draftId)).toEqual(getCurrentDraftPick(world, initial.draftId))

    world = makeDraftSelection(loaded, initial.draftId, userTeamId, getAvailableDraftProspects(loaded, initial.draftId)[0]!)
    expect(progressDraftAi(world, initial.draftId).draftsById[initial.draftId]!.status).toBe('completed')
  })

  it('preserves drafts through unrelated match transitions and keeps legacy saves empty', () => {
    const { world, draftId } = createOpenDraftWorld(1)
    const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
    const afterMatch = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 90, awayScore: 80 })
    const saved = serializeGameWorldV1(world, '2033-06-01T00:00:00.000Z')
    const legacyPayload = { ...saved.payload }
    delete legacyPayload.drafts
    delete legacyPayload.draftPicks

    expect(afterMatch.draftsById[draftId]).toEqual(world.draftsById[draftId])
    expect(afterMatch.draftPicksById).toEqual(world.draftPicksById)
    expect(deserializeGameWorldV1({ ...saved, payload: legacyPayload }).draftsById).toEqual({})
    expect(deserializeGameWorldV1({ ...saved, payload: legacyPayload }).draftPicksById).toEqual({})
  })
})

function createOpenDraftWorld(rounds: number): { world: GameWorld; draftId: string; seasonId: keyof GameWorld['seasons'] } {
  let world = createNewGame()
  const nba = Object.values(world.ecosystems).find((ecosystem) => ecosystem.kind === 'nbaLike')!
  const season = Object.values(world.seasons).find((candidate) => world.competitions[candidate.competitionId]!.ecosystemId === nba.id)!
  for (const game of Object.values(world.games).filter((candidate) => candidate.seasonId === season.id)) {
    world = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 100, awayScore: 90 })
  }
  world = finalizeSeason(world, season.id)
  world = createDraftForCompletedSeason(world, nba.id, season.id, { rounds, orderMethod: 'reverseStandings', scheduledAfterDays: 1 }, [])
  const draftId = Object.keys(world.draftsById)[0]!
  world = generateDraftProspects(world, draftId, rounds * 4)
  const scheduledOn = world.draftsById[draftId]!.scheduledOn
  return { world: updateGameWorld(world, { currentDate: addDays(scheduledOn, -1) }), draftId, seasonId: season.id }
}
