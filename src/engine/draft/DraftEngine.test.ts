import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays, createGameDate } from '@/domain/date'
import { createPlayerContract } from '@/domain/contract'
import { contractIdFromString } from '@/domain/ids'
import type { TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { advanceDay } from '@/engine/calendar'
import { calculateStandings } from '@/engine/competition/standings'
import { applyMatchResult } from '@/engine/match'
import { finalizeSeason } from '@/engine/season'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'

import { chooseAiDraftProspect, considerDraftEntry, createDraftForCompletedSeason, declareDraftEntry, generateDraftProspects, getAiDraftBoard, getAvailableDraftProspects, getCurrentDraftPick, getDraftCandidates, getDraftPicks, makeDraftSelection, openDraft, progressDraftAi, projectDraftCandidates, withdrawDraftEntry } from './DraftEngine'

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
    expect(world.teams[userTeamId]!.rosterPlayerIds).not.toContain(selected)
    expect(Object.values(world.contractsById).filter((contract) => contract.playerId === selected && contract.teamId === userTeamId)).toHaveLength(0)
    expect(Object.values(world.playerRightsById).some((rights) => rights.playerId === selected && rights.ownerTeamId === userTeamId && rights.rightsType === 'draft')).toBe(true)
    expect(makeDraftSelection(world, initial.draftId, userTeamId, selected)).toEqual(world)
    expect(getAvailableDraftProspects(world, initial.draftId)).not.toContain(selected)

    world = progressDraftAi(world, initial.draftId)
    expect(world.draftsById[initial.draftId]!.status).toBe('completed')
    expect(getCurrentDraftPick(world, initial.draftId)).toBeUndefined()
    expect(() => makeDraftSelection(world, initial.draftId, userTeamId, getAvailableDraftProspects(world, initial.draftId)[0]!)).toThrow('Draft is not in progress')
  })

  it('records draft rights without terminating an existing international contract', () => {
    const initial = createOpenDraftWorld(1)
    const scheduledOn = initial.world.draftsById[initial.draftId]!.scheduledOn
    const world = openDraft(updateGameWorld(initial.world, { currentDate: scheduledOn }), initial.draftId)
    const pick = getCurrentDraftPick(world, initial.draftId)!
    const prospect = getAvailableDraftProspects(world, initial.draftId)[0]!
    const template = Object.values(world.contractsById)[0]!
    const contract = createPlayerContract({ ...template, id: contractIdFromString(`draft-active:${prospect}`), playerId: prospect, teamId: pick.ownerTeamId })
    const inconsistent = updateGameWorld(world, { contracts: [...Object.values(world.contractsById), contract] })
    const drafted = makeDraftSelection(inconsistent, initial.draftId, pick.ownerTeamId, prospect)
    expect(drafted.contractsById[contract.id]).toEqual(contract)
    expect(Object.values(drafted.playerRightsById).some((rights) => rights.playerId === prospect && rights.rightsType === 'draft')).toBe(true)
  })

  it('keeps each AI board independent of hidden truth and responsive to its scouting knowledge', () => {
    const setup = createOpenDraftWorld(1)
    const owner = getCurrentDraftPick(setup.world, setup.draftId)!.ownerTeamId
    const world = openDraft(updateGameWorld(setup.world, { currentDate: setup.world.draftsById[setup.draftId]!.scheduledOn }), setup.draftId)
    const board = getAiDraftBoard(world, setup.draftId, owner)
    const truthChanged = updateGameWorld(world, { players: Object.values(world.players).map((player) => player.id.startsWith('draft-prospect:') ? { ...player, basketball: { ...player.basketball, ratings: Object.fromEntries(Object.keys(player.basketball.ratings).map((key, index) => [key, index % 2 === 0 ? 1 : 100])) as typeof player.basketball.ratings } } : player) })
    expect(getAiDraftBoard(truthChanged, setup.draftId, owner)).toEqual(board)

    const target = board.at(-1)!.playerId
    const knowledge = [{ organizationId: world.teams[owner]!.organizationId, subjectPlayerId: target, dimensions: Object.fromEntries(['finishing','shooting','creation','perimeterDefense','interiorDefense','rebounding','physical','potential:physical'].map((dimension) => [dimension, { coverage: 1, confidence: 1, assessedAt: world.currentDate, provenance: 'scoutReport' as const, estimate: 99, uncertainty: 1 }])) }]
    const informed = updateGameWorld(world, { organizationKnowledge: [...world.organizationKnowledge, ...knowledge] })
    expect(getAiDraftBoard(informed, setup.draftId, owner)[0]!.playerId).toBe(target)
  })

  it('completes a multi-organization Draft with different knowledge-driven boards and no hidden-truth access', () => {
    let world = createNewGame()
    const nbaSeason = Object.values(world.seasons).find((season) => world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]!.kind === 'nbaLike')!
    for (const game of Object.values(world.games).filter((item) => item.seasonId === nbaSeason.id)) world = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 95, awayScore: 80 })
    world = finalizeSeason(world, nbaSeason.id)
    const nba = world.ecosystems[world.competitions[nbaSeason.competitionId]!.ecosystemId]!
    const draft = Object.values(world.draftsById).find((item) => item.sourceSeasonId === nbaSeason.id)!
    const ncaa = Object.values(world.ecosystems).find((ecosystem) => ecosystem.kind === 'ncaaLike' && ecosystem.category === 'men')!
    const enrolledPlayers = Object.values(world.teams).filter((team) => Object.values(world.competitions).some((competition) => competition.ecosystemId === ncaa.id && competition.participantTeamIds.includes(team.id))).flatMap((team) => team.rosterPlayerIds.filter((playerId) => Object.values(world.playerEnrollmentsById).some((enrollment) => enrollment.playerId === playerId && enrollment.teamId === team.id && enrollment.status === 'active')))
    const prospectIds = enrolledPlayers.slice(0, 8)
    expect(prospectIds).toHaveLength(8)
    const draftYear = Number(draft.scheduledOn.slice(0, 4))
    const cycle = Object.values(world.recruitingCyclesById).find((item) => item.ecosystemId === ncaa.id)!
    world = updateGameWorld(world, {
      currentDate: draft.rules.earlyEntryDeadline!,
      players: Object.values(world.players).map((player) => prospectIds.includes(player.id) ? { ...player, bio: { ...player.bio, dateOfBirth: createGameDate(draftYear - 19, 1, 1) } } : player),
      recruitProfiles: [...Object.values(world.recruitProfilesById), ...prospectIds.map((playerId, index) => ({ id: `multi-ai-education:${playerId}`, playerId, cycleId: cycle.id, origin: 'preCollege' as const, position: world.players[playerId]!.basketball.primaryPosition, publicRank: index + 1, positionRank: index + 1, tier: 'strong' as const, preferences: { opportunity: 5, development: 5, competing: 5, coach: 5 }, status: 'open' as const, education: { highSchoolGraduationYear: draftYear - 1, completedUsHighSchool: true, enrolledAtUsCollege: true } }))],
    })
    for (const playerId of prospectIds) world = declareDraftEntry(world, draft.id, playerId)
    world = openDraft(updateGameWorld(world, { currentDate: draft.scheduledOn }), draft.id)
    const teams = world.competitions[nbaSeason.competitionId]!.participantTeamIds
    const [teamA, teamB] = teams
    const [playerX, playerY] = prospectIds
    const dimensions = ['finishing','shooting','creation','perimeterDefense','interiorDefense','rebounding','physical','potential:physical']
    const report = (teamId: TeamId, playerId: typeof playerX, estimate: number) => ({ organizationId: world.teams[teamId]!.organizationId, subjectPlayerId: playerId, dimensions: Object.fromEntries(dimensions.map((dimension) => [dimension, { coverage: 1, confidence: 1, assessedAt: world.currentDate, provenance: 'scoutReport' as const, estimate, uncertainty: 1 }])) })
    world = updateGameWorld(world, { organizationKnowledge: [...world.organizationKnowledge, report(teamA!, playerX!, 99), report(teamA!, playerY!, 1), report(teamB!, playerX!, 1), report(teamB!, playerY!, 99)] })
    const boardA = getAiDraftBoard(world, draft.id, teamA), boardB = getAiDraftBoard(world, draft.id, teamB)
    expect(boardA[0]!.playerId).toBe(playerX)
    expect(boardB[0]!.playerId).toBe(playerY)
    expect(boardA.map((row) => row.playerId)).not.toEqual(boardB.map((row) => row.playerId))

    const changedTruth = updateGameWorld(world, { players: Object.values(world.players).map((player) => prospectIds.includes(player.id) ? { ...player, basketball: { ...player.basketball, ratings: Object.fromEntries(Object.keys(player.basketball.ratings).map((key, index) => [key, index % 2 ? 1 : 100])) as typeof player.basketball.ratings } } : player) })
    expect(getAiDraftBoard(changedTruth, draft.id, teamA)).toEqual(boardA)
    expect(getAiDraftBoard(changedTruth, draft.id, teamB)).toEqual(boardB)

    const completed = progressDraftAi(world, draft.id)
    const picks = getDraftPicks(completed, draft.id)
    expect(picks).toHaveLength(8)
    expect(picks.every((pick) => pick.selection?.teamId === pick.ownerTeamId)).toBe(true)
    expect(new Set(picks.map((pick) => pick.selection?.playerId)).size).toBe(picks.length)
    expect(picks.every((pick) => !getAvailableDraftProspects(completed, draft.id).includes(pick.selection!.playerId))).toBe(true)
    expect(Object.values(completed.playerRightsById).filter((rights) => prospectIds.includes(rights.playerId) && rights.rightsType === 'draft')).toHaveLength(8)
    expect(completed.draftsById[draft.id]!.entries?.filter((entry) => entry.status === 'drafted')).toHaveLength(8)
  }, 20_000)

  it('persists considering-to-declared state for an evidence-eligible NCAA Player and replays declaration idempotently', () => {
    const setup = createOpenDraftWorld(1)
    const draft = setup.world.draftsById[setup.draftId]!
    const sourceTeam = Object.values(setup.world.teams).find((team) => team.rosterPlayerIds.some((id) => Object.values(setup.world.playerEnrollmentsById).some((enrollment) => enrollment.playerId === id && enrollment.status === 'active' && enrollment.teamId === team.id)) && Object.values(setup.world.competitions).some((competition) => competition.participantTeamIds.includes(team.id) && setup.world.ecosystems[competition.ecosystemId]!.kind === 'ncaaLike'))!
    const playerId = sourceTeam.rosterPlayerIds.find((id) => Object.values(setup.world.playerEnrollmentsById).some((enrollment) => enrollment.playerId === id && enrollment.status === 'active'))!
    const draftYear = Number(draft.scheduledOn.slice(0, 4))
    let world = updateGameWorld(setup.world, {
      currentDate: addDays(draft.scheduledOn, -5),
      players: Object.values(setup.world.players).map((player) => player.id === playerId ? { ...player, bio: { ...player.bio, dateOfBirth: createGameDate(draftYear - 19, 1, 1) } } : player),
      recruitProfiles: [{ id: 'draft-entry-education-evidence', playerId, cycleId: 'draft-test', origin: 'preCollege', position: setup.world.players[playerId]!.basketball.primaryPosition, publicRank: 1, positionRank: 1, tier: 'strong', preferences: { opportunity: 5, development: 5, competing: 5, coach: 5 }, status: 'open', education: { highSchoolGraduationYear: draftYear - 1, completedUsHighSchool: true, enrolledAtUsCollege: true } }],
      drafts: Object.values(setup.world.draftsById).map((item) => item.id === draft.id ? { ...item, rules: { ...item.rules, earlyEntryDeadline: addDays(item.scheduledOn, -4), collegeWithdrawalDeadline: addDays(item.scheduledOn, -2), finalWithdrawalDeadline: addDays(item.scheduledOn, 1) } } : item),
    })
    world = considerDraftEntry(world, draft.id, playerId)
    const considered = world.draftsById[draft.id]!.entries!.find((entry) => entry.playerId === playerId)!
    expect(considered.status).toBe('considering')
    world = declareDraftEntry(world, draft.id, playerId)
    const declared = world.draftsById[draft.id]!.entries!.find((entry) => entry.playerId === playerId)!
    expect(declared.history?.map((event) => event.status)).toEqual(['considering', 'declaredEarlyEntry'])
    expect(world.draftsById[draft.id]!.prospectPlayerIds).not.toContain(playerId)
    const afterDeclaration = projectDraftCandidates(world, draft.id)
    expect(afterDeclaration.earlyEntryPlayerIds).toContain(playerId)
    expect(afterDeclaration.playersAfter - afterDeclaration.playersBefore).toBe(0)
    expect(getDraftCandidates(world, draft.id)).toContain(playerId)
    expect(declareDraftEntry(world, draft.id, playerId)).toEqual(world)
    const loaded = deserializeGameWorldV1(serializeGameWorldV1(world, '2033-06-01T00:00:00.000Z'))
    expect(loaded.draftsById[draft.id]!.entries!.find((entry) => entry.playerId === playerId)?.history).toEqual(declared.history)
    world = updateGameWorld(world, { currentDate: addDays(draft.scheduledOn, -1) })
    const withdrawnAfterNcaDeadline = withdrawDraftEntry(world, draft.id, playerId)
    expect(withdrawnAfterNcaDeadline.draftsById[draft.id]!.entries!.find((entry) => entry.playerId === playerId)?.status).toBe('withdrawnNCAAIneligible')
    const afterWithdrawal = projectDraftCandidates(withdrawnAfterNcaDeadline, draft.id)
    expect(afterWithdrawal.playerIds).not.toContain(playerId)
    expect(afterWithdrawal.playersAfter - afterWithdrawal.playersBefore).toBe(0)
    expect(withdrawDraftEntry(withdrawnAfterNcaDeadline, draft.id, playerId)).toEqual(withdrawnAfterNcaDeadline)
  })

  it('opens and progresses through advanceDay while the FIBA-like competition remains active', () => {
    const { world, draftId } = createOpenDraftWorld(1)
    const advanced = advanceDay(world)

    expect(advanced.draftsById[draftId]!.status).toBe('completed')
    expect(Object.values(advanced.competitions).some((competition) => advanced.ecosystems[competition.ecosystemId]!.kind === 'fibaLike' && Object.values(advanced.games).some((game) => game.competitionId === competition.id && game.status === 'scheduled'))).toBe(true)
    expect(Object.keys(advanceDay(createNewGame()).draftsById)).toEqual([])
  }, 20_000)

  it('is deterministic and persists an in-progress user-paused draft without regeneration', () => {
    const initial = createOpenDraftWorld(1)
    const userTeamId = Object.values(initial.world.teams).find((team) => team.coachId === initial.world.userCoachId)!.id
    let world = openDraft(updateGameWorld(initial.world, { currentDate: initial.world.draftsById[initial.draftId]!.scheduledOn, draftPicks: getDraftPicks(initial.world, initial.draftId).map((pick, index) => index === 1 ? { ...pick, ownerTeamId: userTeamId } : pick) }), initial.draftId)
    const firstChoice = chooseAiDraftProspect(world, initial.draftId)
    expect(chooseAiDraftProspect(world, initial.draftId)).toBe(firstChoice)
    world = progressDraftAi(world, initial.draftId)
    const draft = world.draftsById[initial.draftId]!
    world = updateGameWorld(world, { drafts: Object.values(world.draftsById).map((item) => item.id === draft.id ? { ...item, entries: item.prospectPlayerIds.map((playerId) => ({ id: `draft-entry:${draft.id}:${playerId}`, draftId: draft.id, playerId, status: 'declaredEarlyEntry' as const, entryType: 'early' as const, sourcePathway: 'other' as const, declaredOn: world.currentDate, provenance: 'PRODUCT_ABSTRACTION' as const, history: [{ status: 'considering' as const, occurredOn: world.currentDate }, { status: 'declaredEarlyEntry' as const, occurredOn: world.currentDate }] })) } : item) })

    const loaded = deserializeGameWorldV1(serializeGameWorldV1(world, '2033-06-01T00:00:00.000Z'))
    expect(loaded.draftsById).toEqual(world.draftsById)
    expect(loaded.draftPicksById).toEqual(world.draftPicksById)
    expect(loaded.players).toEqual(world.players)
    expect(loaded.teams).toEqual(world.teams)
    expect(getAvailableDraftProspects(loaded, initial.draftId)).toEqual(getAvailableDraftProspects(world, initial.draftId))
    expect(getCurrentDraftPick(loaded, initial.draftId)).toEqual(getCurrentDraftPick(world, initial.draftId))
    expect(getCurrentDraftPick(loaded, initial.draftId)?.ownerTeamId).toBe(userTeamId)
    expect(getAvailableDraftProspects(loaded, initial.draftId)).toHaveLength(3)

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
  world = updateGameWorld(world, { drafts: [], draftPicks: [], players: Object.values(world.players).filter((player) => !player.id.startsWith('draft-prospect:')) })
  const playerCountBeforeDraftPool = Object.keys(world.players).length
  world = createDraftForCompletedSeason(world, nba.id, season.id, { rounds, orderMethod: 'reverseStandings', scheduledAfterDays: 1 }, [])
  expect(Object.keys(world.players).length).toBe(playerCountBeforeDraftPool)
  const draftId = Object.values(world.draftsById).find((draft) => draft.sourceSeasonId === season.id)!.id
  if (world.draftsById[draftId]!.prospectPlayerIds.length === 0) world = generateDraftProspects(world, draftId, rounds * 4)
  const scheduledOn = world.draftsById[draftId]!.scheduledOn
  return { world: updateGameWorld(world, { currentDate: addDays(scheduledOn, -1) }), draftId, seasonId: season.id }
}
