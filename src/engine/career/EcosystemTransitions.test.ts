import { progressCollegeEligibilityExits } from '@/engine/eligibility/CollegeEligibilityLifecycle'
import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { chooseAiDraftProspect, createDraftForCompletedSeason, declareDraftEntry, getAvailableDraftProspects, getCurrentDraftPick, makeDraftSelection, openDraft, progressDraftAi, withdrawDraftEntry } from '@/engine/draft'
import { applyMatchResult } from '@/engine/match'
import { finalizeSeason } from '@/engine/season'
import { updateGameWorld } from '@/domain/world'
import { getPlayerContractStatus } from '@/domain/contract'
import { nbaDraftRulesForYear } from '@/domain/draft'
import { addDays, createGameDate } from '@/domain/date'

import { signDraftRightsToNba, signUndraftedPlayerToNba, transitionFibaPlayerToFiba, transitionFibaPlayerToNba, transitionNbaPlayerToFiba, transitionNcaaPlayerToFiba, transitionNcaaPlayerToNbaDraft } from './EcosystemTransitions'

function teamIn(world: ReturnType<typeof createNewGame>, kind: 'fibaLike' | 'nbaLike' | 'ncaaLike') {
  const competition = Object.values(world.competitions).find((candidate) => world.ecosystems[candidate.ecosystemId]!.kind === kind)!
  return world.teams[competition.participantTeamIds[0]!]!
}

describe('EcosystemTransitions', () => {
  it('keeps Draft selection unsigned until the professional contract gateway runs', () => {
    let world = createNewGame(), season = Object.values(world.seasons).find((item) => world.ecosystems[world.competitions[item.competitionId]!.ecosystemId]!.kind === 'nbaLike')!
    for (const game of Object.values(world.games).filter((game) => game.seasonId === season.id)) world = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 90, awayScore: 80 })
    world = finalizeSeason(world, season.id)
    const ncaa = teamIn(world, 'ncaaLike'), playerId = ncaa.rosterPlayerIds[0]!, nba = Object.values(world.ecosystems).find((item) => item.kind === 'nbaLike')!
    world = updateGameWorld(world, { drafts: [], draftPicks: [], players: Object.values(world.players).filter((player) => !player.id.startsWith('draft-prospect:')) })
    world = createDraftForCompletedSeason(world, nba.id, season.id, { rounds: 1, orderMethod: 'reverseStandings', scheduledAfterDays: 1 }, [playerId])
    const draft = Object.values(world.draftsById).find((item) => item.sourceSeasonId === season.id)!
    world = openDraft(updateGameWorld(world, { currentDate: draft.scheduledOn }), draft.id)
    const pick = getCurrentDraftPick(world, draft.id)!, original = world.players[playerId]!, personId = original.personId
    const selected = makeDraftSelection(world, draft.id, pick.ownerTeamId, playerId)
    const rights = Object.values(selected.playerRightsById).find((item) => item.playerId === playerId && item.rightsType === 'draft')!
    expect(selected.teams[ncaa.id]!.rosterPlayerIds).toContain(playerId)
    expect(selected.teams[pick.ownerTeamId]!.rosterPlayerIds).not.toContain(playerId)
    expect(rights.contractId).toBeUndefined()
    expect(Object.values(selected.contractsById).some((contract) => contract.playerId === playerId && contract.teamId === pick.ownerTeamId)).toBe(false)

    const signed = signDraftRightsToNba(selected, { id: 'transition:draft-rights-sign', playerId, toTeamId: pick.ownerTeamId, rightsId: rights.id, annualSalary: 500_000, contractYears: 2 })
    expect(signed.players[playerId]!.personId).toBe(personId)
    expect(signed.playerRightsById[rights.id]!.contractId).toBeDefined()
    expect(signed.contractsById[signed.playerRightsById[rights.id]!.contractId as never]?.playerId).toBe(playerId)
    expect(signed.teams[pick.ownerTeamId]!.rosterPlayerIds).toContain(playerId)
    expect(signed.ecosystemTransitionsById['transition:draft-rights-sign']?.playerId).toBe(playerId)
    const reloaded = deserializeGameWorldV1(serializeGameWorldV1(signed, '2032-10-01T00:00:00.000Z'))
    expect(reloaded.playerRightsById[rights.id]!.contractId).toBe(signed.playerRightsById[rights.id]!.contractId)
  })

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
    expect(Object.values(moved.playerRightsById).some((rights) => rights.playerId === playerId && rights.ownerTeamId === pick.ownerTeamId && rights.rightsType === 'draft')).toBe(true)
    expect(moved.teams[pick.ownerTeamId]!.rosterPlayerIds).toContain(playerId)
    expect(Object.values(moved.playerEnrollmentsById).filter((item) => item.playerId === playerId && item.status === 'active')).toHaveLength(0)
    expect(Object.values(moved.ecosystemTransitionsById).some((transition) => transition.playerId === playerId && transition.transitionType === 'ncaaToNbaDraft')).toBe(true)
    const linkedRights = Object.values(moved.playerRightsById).find((rights) => rights.playerId === playerId && rights.rightsType === 'draft')!
    expect(moved.ecosystemTransitionsById['transition:ncaa-nba']!.contractId).toBe(linkedRights.contractId)
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

  it('moves an existing international Player between FIBA clubs with a new canonical contract', () => {
    const world = createNewGame(), source = teamIn(world, 'fibaLike'), destination = Object.values(world.teams).find((team) => team.id !== source.id && Object.values(world.competitions).some((competition) => competition.participantTeamIds.includes(team.id) && world.ecosystems[competition.ecosystemId]?.kind === 'fibaLike'))!, playerId = source.rosterPlayerIds[0]!, personId = world.players[playerId]!.personId
    const sourceContract = Object.values(world.contractsById).find((contract) => contract.playerId === playerId && contract.teamId === source.id && getPlayerContractStatus(contract, world.currentDate) === 'active')!
    const moved = transitionFibaPlayerToFiba(world, { id: 'transition:fiba-club-move', playerId, toTeamId: destination.id, annualSalary: 175_000, contractYears: 2 })
    const destinationContract = Object.values(moved.contractsById).find((contract) => contract.playerId === playerId && contract.teamId === destination.id)!
    expect(moved.players[playerId]!.personId).toBe(personId)
    expect(moved.teams[source.id]!.rosterPlayerIds).not.toContain(playerId)
    expect(moved.teams[destination.id]!.rosterPlayerIds).toContain(playerId)
    expect(moved.contractsById[sourceContract.id]!.termination?.terminatedOn).toBe(world.currentDate)
    expect(destinationContract.id).not.toBe(sourceContract.id)
    expect(moved.ecosystemTransitionsById['transition:fiba-club-move']?.transitionType).toBe('fibaToFiba')
    expect(moved.ecosystemTransitionsById['transition:fiba-club-move']?.contractId).toBe(destinationContract.id)
    expect(deserializeGameWorldV1(serializeGameWorldV1(moved, '2032-10-01T00:00:00.000Z')).ecosystemTransitionsById['transition:fiba-club-move']).toEqual(moved.ecosystemTransitionsById['transition:fiba-club-move'])
  })

  it('uses distinct destination contracts for FIBA-to-NBA and NBA-to-FIBA moves', () => {
    const first = createNewGame(), fiba = teamIn(first, 'fibaLike'), nba = teamIn(first, 'nbaLike'), playerId = fiba.rosterPlayerIds[0]!
    const sourceContract = Object.values(first.contractsById).find((contract) => contract.playerId === playerId && contract.teamId === fiba.id && getPlayerContractStatus(contract, first.currentDate) === 'active')
    if (sourceContract !== undefined) expect(() => transitionFibaPlayerToNba(first, { id: 'transition:fiba-nba', playerId, toTeamId: nba.id, annualSalary: 200_000, contractYears: 2 })).toThrow(/must be released/)
    const releasedWorld = sourceContract === undefined ? first : updateGameWorld(first, { contracts: Object.values(first.contractsById).map((contract) => contract.id === sourceContract.id ? { ...contract, termination: { terminatedOn: first.currentDate, reason: 'released' as const } } : contract) })
    const toNba = transitionFibaPlayerToNba(releasedWorld, { id: 'transition:fiba-nba', playerId, toTeamId: nba.id, annualSalary: 200_000, contractYears: 2 })
    const nbaContract = Object.values(toNba.contractsById).find((contract) => contract.playerId === playerId && contract.teamId === nba.id)!
    expect(toNba.teams[nba.id]!.rosterPlayerIds).toContain(playerId)
    expect(Object.values(toNba.contractsById).some((contract) => contract.playerId === playerId && contract.teamId === fiba.id && contract.termination !== undefined)).toBe(sourceContract !== undefined)

    const fibaDestination = teamIn(toNba, 'fibaLike')
    const back = transitionNbaPlayerToFiba(toNba, { id: 'transition:nba-fiba', playerId, toTeamId: fibaDestination.id, annualSalary: 150_000, contractYears: 1 })
    const fibaContract = Object.values(back.contractsById).find((contract) => contract.playerId === playerId && contract.teamId === fibaDestination.id)!
    expect(fibaContract.id).not.toBe(nbaContract.id)
    expect(back.teams[fibaDestination.id]!.rosterPlayerIds).toContain(playerId)
    expect(Object.values(back.teams).filter((team) => team.rosterPlayerIds.includes(playerId))).toHaveLength(1)
  })

  it('takes an undrafted NCAA Player through free agency to an NBA contract and roster', () => {
    let world = createNewGame(), season = Object.values(world.seasons).find((item) => world.ecosystems[world.competitions[item.competitionId]!.ecosystemId]!.kind === 'nbaLike')!
    for (const game of Object.values(world.games).filter((game) => game.seasonId === season.id)) world = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 90, awayScore: 80 })
    world = finalizeSeason(world, season.id)
    const nba = Object.values(world.ecosystems).find((item) => item.kind === 'nbaLike')!, source = teamIn(world, 'ncaaLike'), prospects = source.rosterPlayerIds.slice(0, 5)
    world = updateGameWorld(world, { drafts: [], draftPicks: [], players: Object.values(world.players).filter((player) => !player.id.startsWith('draft-prospect:')) })
    world = createDraftForCompletedSeason(world, nba.id, season.id, { rounds: 1, orderMethod: 'reverseStandings', scheduledAfterDays: 1 }, prospects)
    const draft = Object.values(world.draftsById).find((item) => item.sourceSeasonId === season.id)!
    world = openDraft(updateGameWorld(world, { currentDate: draft.scheduledOn }), draft.id)
    const personId = world.players[prospects[4]!]!.personId
    while (getCurrentDraftPick(world, draft.id) !== undefined) {
      const pick = getCurrentDraftPick(world, draft.id)!, candidate = getAvailableDraftProspects(world, draft.id)[0]!
      world = makeDraftSelection(world, draft.id, pick.ownerTeamId, candidate)
    }
    expect(world.draftsById[draft.id]!.entries?.find((entry) => entry.playerId === prospects[4])?.status).toBe('undrafted')
    const target = teamIn(world, 'nbaLike')
    const moved = signUndraftedPlayerToNba(world, { id: 'transition:undrafted-nba', playerId: prospects[4]!, draftId: draft.id, toTeamId: target.id })
    expect(moved.players[prospects[4]!]!.personId).toBe(personId)
    expect(moved.teams[source.id]!.rosterPlayerIds).not.toContain(prospects[4])
    expect(moved.teams[target.id]!.rosterPlayerIds).toContain(prospects[4])
    expect(Object.values(moved.contractsById).some((contract) => contract.playerId === prospects[4] && contract.teamId === target.id)).toBe(true)
    expect(moved.ecosystemTransitionsById['transition:undrafted-nba']?.transitionType).toBe('ncaaToNbaUndrafted')
    expect(moved.ecosystemTransitionsById['transition:undrafted-nba']?.contractId).toBeDefined()
    const exhausted = updateGameWorld(world, { eligibilityProfiles: Object.values(world.eligibilityProfilesById).map(item => item.playerId === prospects[4] ? { ...item, seasonsUsed: 4 } : item) })
    const released = progressCollegeEligibilityExits(exhausted)
    expect(released.teams[source.id]!.rosterPlayerIds).not.toContain(prospects[4])
    const signedFormer = signUndraftedPlayerToNba(released, { id: 'transition:former-undrafted', playerId: prospects[4]!, draftId: draft.id, toTeamId: target.id })
    expect(signedFormer.players[prospects[4]!]!.personId).toBe(personId)
    expect(signedFormer.teams[target.id]!.rosterPlayerIds).toContain(prospects[4])
    expect(signedFormer.ecosystemTransitionsById['transition:former-undrafted']).toMatchObject({ fromTeamId: source.id, toTeamId: target.id, transitionType: 'ncaaToNbaUndrafted' })

  })

  it('runs a simulated 2045 Draft with one international signing and an undrafted professional route', () => {
    let world = createNewGame(), season = Object.values(world.seasons).find((item) => world.ecosystems[world.competitions[item.competitionId]!.ecosystemId]!.kind === 'nbaLike')!
    const existingPlayerCount = Object.keys(world.players).length
    for (const game of Object.values(world.games).filter((game) => game.seasonId === season.id)) world = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 90, awayScore: 80 })
    world = finalizeSeason(world, season.id)
    const ncaa = teamIn(world, 'ncaaLike'), fiba = teamIn(world, 'fibaLike'), nba = Object.values(world.ecosystems).find((item) => item.kind === 'nbaLike')!, collegePlayers = ncaa.rosterPlayerIds.slice(0, 4), internationalPlayerId = fiba.rosterPlayerIds[0]!, prospects = [...collegePlayers, internationalPlayerId]
    const recruitingCycleId = Object.values(world.recruitingCyclesById).find((cycle) => cycle.ecosystemId === Object.values(world.competitions).find((competition) => competition.participantTeamIds.includes(ncaa.id))!.ecosystemId)!.id
    world = updateGameWorld(world, {
      drafts: [], draftPicks: [], players: Object.values(world.players).filter((player) => !player.id.startsWith('draft-prospect:')).map((player) => player.id === internationalPlayerId ? { ...player, bio: { ...player.bio, dateOfBirth: createGameDate(2023, 1, 1) } } : player),
      recruitProfiles: prospects.map((playerId, index) => ({ id: `2045-education:${playerId}`, playerId, cycleId: recruitingCycleId, origin: playerId === internationalPlayerId ? 'international' as const : 'preCollege' as const, position: world.players[playerId]!.basketball.primaryPosition, publicRank: index + 1, positionRank: index + 1, tier: 'strong' as const, preferences: { opportunity: 5, development: 5, competing: 5, coach: 5 }, status: 'open' as const, education: playerId === internationalPlayerId ? { completedUsHighSchool: false, enrolledAtUsCollege: false, yearsResidentOutsideUsBeforeDraft: 4, yearsPlayingBasketballOutsideUsBeforeDraft: 4 } : { highSchoolGraduationYear: playerId === collegePlayers[0] || playerId === collegePlayers[1] ? 2044 : 2027, completedUsHighSchool: true, enrolledAtUsCollege: true } })),
    })
    const rules = nbaDraftRulesForYear(2045, 1)
    world = createDraftForCompletedSeason(world, nba.id, season.id, rules, [])
    const draft = Object.values(world.draftsById).find((item) => item.sourceSeasonId === season.id)!
    const personId = world.players[internationalPlayerId]!.personId
    const declarantId = collegePlayers[0]!, withdrawerId = collegePlayers[1]!
    world = updateGameWorld(world, { currentDate: rules.earlyEntryDeadline! })
    world = declareDraftEntry(world, draft.id, declarantId)
    world = declareDraftEntry(world, draft.id, withdrawerId)
    world = updateGameWorld(world, { currentDate: addDays(rules.collegeWithdrawalDeadline!, -1) })
    world = withdrawDraftEntry(world, draft.id, withdrawerId)
    expect(world.draftsById[draft.id]!.entries?.find((entry) => entry.playerId === declarantId)?.status).toBe('declaredEarlyEntry')
    expect(world.draftsById[draft.id]!.entries?.find((entry) => entry.playerId === withdrawerId)?.status).toBe('withdrawnNCAAIneligible')
    expect(world.draftsById[draft.id]!.entries?.find((entry) => entry.playerId === withdrawerId)?.collegeReturnAssessment?.reasons).not.toHaveLength(0)
    world = openDraft(updateGameWorld(world, { currentDate: createGameDate(2045, 6, 23) }), draft.id)
    expect(Object.keys(world.players)).toHaveLength(existingPlayerCount)
    expect(draft.rules.provenance).toBe('SIMULATED_CARRY_FORWARD')
    expect(draft.scheduledOn.slice(0, 4)).toBe('2045')
    expect(world.draftsById[draft.id]!.entries?.some((entry) => entry.entryType === 'automatic' && entry.sourcePathway === 'college')).toBe(true)
    expect(getAvailableDraftProspects(world, draft.id)).toContain(declarantId)
    expect(getAvailableDraftProspects(world, draft.id)).not.toContain(withdrawerId)
    const firstPick = getCurrentDraftPick(world, draft.id)!
    world = makeDraftSelection(world, draft.id, firstPick.ownerTeamId, internationalPlayerId)
    const rights = Object.values(world.playerRightsById).find((item) => item.playerId === internationalPlayerId && item.ownerTeamId === firstPick.ownerTeamId)!
    world = signDraftRightsToNba(world, { id: 'transition:2045-international-nba', playerId: internationalPlayerId, toTeamId: firstPick.ownerTeamId, rightsId: rights.id, annualSalary: 750_000, contractYears: 2 })
    let aiOwnedPickCount = 0
    const userTeamId = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)?.id
    while (getCurrentDraftPick(world, draft.id) !== undefined) {
      const pick = getCurrentDraftPick(world, draft.id)!, playerId = chooseAiDraftProspect(world, draft.id, pick.ownerTeamId)!
      if (pick.ownerTeamId !== userTeamId) aiOwnedPickCount += 1
      world = makeDraftSelection(world, draft.id, pick.ownerTeamId, playerId)
    }
    const undraftedId = prospects.find((playerId) => world.draftsById[draft.id]!.entries?.find((entry) => entry.playerId === playerId)?.status === 'undrafted')!
    expect(draft.rules.provenance).toBe('SIMULATED_CARRY_FORWARD')
    expect(aiOwnedPickCount).toBeGreaterThanOrEqual(3)
    expect(world.draftsById[draft.id]!.entries?.find((entry) => entry.playerId === withdrawerId)?.history?.map((event) => event.status)).toContain('withdrawnNCAAIneligible')
    expect(getAvailableDraftProspects(world, draft.id)).toHaveLength(0)
    const undrafted = signUndraftedPlayerToNba(world, { id: 'transition:2045-undrafted-nba', playerId: undraftedId, draftId: draft.id, toTeamId: firstPick.ownerTeamId })
    expect(undrafted.players[internationalPlayerId]!.personId).toBe(personId)
    expect(undrafted.playerRightsById[rights.id]!.contractId).toBeDefined()
    expect(undrafted.teams[firstPick.ownerTeamId]!.rosterPlayerIds).toContain(internationalPlayerId)
    expect(undrafted.ecosystemTransitionsById['transition:2045-international-nba']!.contractId).toBeDefined()
    expect(undrafted.ecosystemTransitionsById['transition:2045-undrafted-nba']!.contractId).toBeDefined()
    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(undrafted, `${undrafted.currentDate}T00:00:00.000Z`))
    expect(reloaded.players[undraftedId]).toEqual(undrafted.players[undraftedId])
    expect(reloaded.draftsById[draft.id]).toEqual(undrafted.draftsById[draft.id])
    expect(reloaded.draftPicksById).toEqual(undrafted.draftPicksById)
    expect(reloaded.playerRightsById[rights.id]).toEqual(undrafted.playerRightsById[rights.id])
    expect(reloaded.ecosystemTransitionsById).toEqual(undrafted.ecosystemTransitionsById)
    expect(signUndraftedPlayerToNba(reloaded, { id: 'transition:2045-undrafted-nba', playerId: undraftedId, draftId: draft.id, toTeamId: firstPick.ownerTeamId })).toEqual(reloaded)
  })
})
