import { describe, expect, it } from 'vitest'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { createNewGame } from '@/app/game'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { DEFAULT_FIBA_LIKE_ECOSYSTEM_ID } from '@/domain/ecosystem'
import { defaultRecruitingRules } from '@/domain/recruiting'
import { createGameDate } from '@/domain/date'
import { organizationIdForTeam, teamIdFromString } from '@/domain/ids'
import { generateRecruitingPool, makeRecruitingOffer, performRecruitingAction, rankAiRecruitingTargets, resolveRecruitingCommitments } from './RecruitingEngine'
import { addTransferRecruitToCycle, completeCollegeTransfer, signCommittedRecruit } from './RecruitingEngine'
import { createTransferPortalEntry } from '@/domain/eligibility'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { finalizeSeason } from '@/engine/season'
import { applyMatchResult } from '@/engine/match'
import { declareDraftEntry, getCurrentDraftPick, getDraftCandidates, makeDraftSelection, openDraft } from '@/engine/draft'
import { signDraftRightsToNba } from '@/engine/career'

function world() { return updateGameWorld(createGameWorld(createValidGameWorldInput()), { recruitingCycles: [{ id: 'cycle-1', ecosystemId: DEFAULT_FIBA_LIKE_ECOSYSTEM_ID, sourceSeasonId: 'season-a' as never, targetSeasonId: 'season-a' as never, opensOn: createGameDate(2032, 10, 1), signingOn: createGameDate(2032, 11, 1), closesOn: createGameDate(2032, 12, 1), status: 'open', rules: { ...defaultRecruitingRules, poolSize: 5, commitmentThreshold: 1 } }] }) }

describe('RecruitingEngine canonical operations', () => {
  it('generates deterministic canonical unrostered players', () => {
    const first = generateRecruitingPool(world(), 'cycle-1'); const second = generateRecruitingPool(world(), 'cycle-1')
    expect(Object.values(first.recruitProfilesById).map((profile) => profile.playerId)).toEqual(Object.values(second.recruitProfilesById).map((profile) => profile.playerId))
    expect(Object.values(first.recruitProfilesById)).toHaveLength(5)
    expect(first.teams[teamIdFromString('team-home')]!.rosterPlayerIds).toHaveLength(1)
  })
  it('keeps deterministic player IDs globally unique across recruiting cycles', () => {
    const firstCycleWorld = generateRecruitingPool(world(), 'cycle-1')
    const cycleTwo = { ...firstCycleWorld.recruitingCyclesById['cycle-1']!, id: 'cycle-2', sourceSeasonId: 'season-b' as never, targetSeasonId: 'season-b' as never }
    const withSecondCycle = updateGameWorld(firstCycleWorld, { recruitingCycles: [...Object.values(firstCycleWorld.recruitingCyclesById), cycleTwo] })
    const generated = generateRecruitingPool(withSecondCycle, 'cycle-2')
    const firstCyclePlayerIds = Object.values(firstCycleWorld.recruitProfilesById).map((profile) => profile.playerId)
    const playerIds = Object.values(generated.recruitProfilesById).map((profile) => profile.playerId)
    expect(new Set(playerIds).size).toBe(playerIds.length)
    expect(firstCyclePlayerIds).toHaveLength(5)
    expect(playerIds.filter((id) => !firstCyclePlayerIds.includes(id))).toHaveLength(5)
    expect(new Set(Object.keys(generated.players)).size).toBe(Object.keys(generated.players).length)
  })
  it('consumes capacity, records actions and commits only after competition', () => {
    const generated = generateRecruitingPool(world(), 'cycle-1'); const recruit = Object.values(generated.recruitProfilesById)[0]!; const program = 'team-home' as never
    const contacted = performRecruitingAction(generated, 'cycle-1', recruit.id, program, 'contact'); expect(contacted.ok).toBe(true)
    if (!contacted.ok) return
    const offered = makeRecruitingOffer(contacted.value, 'cycle-1', recruit.id, program); expect(offered.ok).toBe(true)
    if (!offered.ok) return
    const committed = resolveRecruitingCommitments(offered.value, 'cycle-1')
    expect(Object.values(committed.recruitingCommitmentsById)[0]?.programTeamId).toBe(program)
    expect(Object.values(committed.recruitingActionHistoryById)).toHaveLength(1)
  })
  it('assigns a new identity when a withdrawn offer is made again', () => {
    const generated = generateRecruitingPool(world(), 'cycle-1')
    const recruit = Object.values(generated.recruitProfilesById)[0]!
    const program = teamIdFromString('team-home')
    const first = makeRecruitingOffer(generated, 'cycle-1', recruit.id, program)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const withdrawn = updateGameWorld(first.value, { recruitingOffers: Object.values(first.value.recruitingOffersById).map((item) => ({ ...item, status: 'withdrawn' as const })) })
    const reopened = makeRecruitingOffer(withdrawn, 'cycle-1', recruit.id, program)
    expect(reopened.ok).toBe(true)
    if (!reopened.ok) return
    expect(Object.keys(reopened.value.recruitingOffersById)).toHaveLength(2)
    expect(Object.values(reopened.value.recruitingOffersById).map((item) => item.id)).toContain(`${first.value.recruitingOffersById[Object.keys(first.value.recruitingOffersById)[0]!]!.id}:attempt:2`)
  })
  it('keeps AI target ordering invariant when only hidden prospect truth changes', () => {
    const generated = generateRecruitingPool(world(), 'cycle-1'); const program = teamIdFromString('team-home')
    const before = rankAiRecruitingTargets(generated, 'cycle-1', program).map((profile) => profile.id)
    const prospect = Object.values(generated.recruitProfilesById)[0]!
    const changed = updateGameWorld(generated, { players: Object.values(generated.players).map((player) => player.id !== prospect.playerId ? player : { ...player, basketball: { ...player.basketball, ratings: { ...player.basketball.ratings, threePointShooting: 100, passing: 100 } } }) })
    expect(rankAiRecruitingTargets(changed, 'cycle-1', program).map((profile) => profile.id)).toEqual(before)
  })
  it('uses only the recruiting organization knowledge for its target ordering', () => {
    const generated = generateRecruitingPool(world(), 'cycle-1'); const program = teamIdFromString('team-home'); const other = teamIdFromString('team-away'); const prospect = Object.values(generated.recruitProfilesById)[0]!
    const before = rankAiRecruitingTargets(generated, 'cycle-1', program).map((profile) => profile.id)
    const changed = updateGameWorld(generated, { organizationKnowledge: [{ organizationId: organizationIdForTeam(other), subjectPlayerId: prospect.playerId, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: generated.currentDate, provenance: 'scoutReport', estimate: 100, uncertainty: 1 } } }] })
    expect(rankAiRecruitingTargets(changed, 'cycle-1', program).map((profile) => profile.id)).toEqual(before)
  })
  it('moves an authorized transfer through BS15E Recruiting without changing Player identity', () => {
    const initial = createNewGame()
    const cycle = Object.values(initial.recruitingCyclesById).find((item) => item.ecosystemId === Object.values(initial.ecosystems).find((ecosystem) => ecosystem.kind === 'ncaaLike' && ecosystem.category === 'men')?.id)!
    const competition = initial.competitions[initial.seasons[cycle.sourceSeasonId]!.competitionId]!
    const sourceTeamId = competition.participantTeamIds.find((teamId) => initial.teams[teamId]!.rosterPlayerIds.length > 0)!
    const destinationTeamId = competition.participantTeamIds.find((teamId) => teamId !== sourceTeamId)!
    const playerId = initial.teams[sourceTeamId]!.rosterPlayerIds[0]!
    const personId = initial.players[playerId]!.personId
    const sourceEligibility = Object.values(initial.eligibilityProfilesById).find((item) => item.playerId === playerId && item.programTeamId === sourceTeamId)!
    const sourceEnrollment = Object.values(initial.playerEnrollmentsById).find((item) => item.playerId === playerId && item.teamId === sourceTeamId && item.status === 'active')!
    const ruleset = Object.values(initial.transferPortalRulesetsById).find((item) => item.ecosystemId === cycle.ecosystemId)!
    const portalEntry = createTransferPortalEntry({ id: 'test-transfer-entry', playerId, sourceTeamId, ecosystemId: cycle.ecosystemId, rulesetId: ruleset.id, notifiedOn: initial.currentDate, educationalModuleCompletedOn: initial.currentDate, processedOn: initial.currentDate, processingDueOn: initial.currentDate, status: 'authorized' })
    const authorized = updateGameWorld(initial, { transferPortalEntries: [portalEntry], recruitingCycles: Object.values(initial.recruitingCyclesById).map((item) => item.id === cycle.id ? { ...item, status: 'open', rules: { ...item.rules, commitmentThreshold: -100 } } : item) })
    const added = addTransferRecruitToCycle(authorized, cycle.id, portalEntry.id)
    expect(added.ok, added.ok ? '' : added.reason).toBe(true)
    if (!added.ok) return
    const profile = Object.values(added.value.recruitProfilesById).find((item) => item.transferPortalEntryId === portalEntry.id)!
    expect(profile.playerId).toBe(playerId)
    expect(added.value.teams[sourceTeamId]!.rosterPlayerIds).toContain(playerId)
    const offer = makeRecruitingOffer(added.value, cycle.id, profile.id, destinationTeamId)
    expect(offer.ok).toBe(true)
    if (!offer.ok) return
    const committed = resolveRecruitingCommitments(offer.value, cycle.id)
    const signed = signCommittedRecruit(committed, cycle.id, profile.id)
    expect(signed.ok).toBe(true)
    if (!signed.ok) return
    const moved = completeCollegeTransfer(signed.value, profile.id)
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(moved.value.players[playerId]).toEqual(initial.players[playerId])
    expect(moved.value.players[playerId]!.personId).toBe(personId)
    expect(moved.value.teams[sourceTeamId]!.rosterPlayerIds).not.toContain(playerId)
    expect(moved.value.teams[destinationTeamId]!.rosterPlayerIds).toContain(playerId)
    expect(Object.values(moved.value.playerEnrollmentsById).filter((item) => item.playerId === playerId && item.status === 'active').map((item) => item.teamId)).toEqual([destinationTeamId])
    expect(moved.value.playerEnrollmentsById[sourceEnrollment.id]).toMatchObject({ status: 'ended', endsOn: initial.currentDate })
    expect(Object.values(moved.value.eligibilityProfilesById).find((item) => item.playerId === playerId && item.programTeamId === destinationTeamId)?.seasonsUsed).toBe(sourceEligibility.seasonsUsed)
    expect(moved.value.transferPortalEntriesById[portalEntry.id]?.status).toBe('completed')
    expect(moved.value.recruitProfilesById[profile.id]?.status).toBe('arrived')
    expect(moved.value.transferPortalEntriesById[portalEntry.id]?.movement).toMatchObject({ playerId, sourceTeamId, destinationTeamId, sourceEnrollmentId: sourceEnrollment.id, formalSigningId: expect.any(String), authority: 'AUTHORIZED_PORTAL_ENTRY' })
    expect(completeCollegeTransfer(moved.value, profile.id)).toEqual({ ok: true, value: moved.value })
    let saveable = moved.value
    for (const season of Object.values(saveable.seasons)) {
      const games = Object.values(saveable.games).filter((game) => game.seasonId === season.id)
      if (games.length > 0 && games.every((game) => game.status === 'completed') && saveable.seasonHistoryBySeasonId[season.id] === undefined) saveable = finalizeSeason(saveable, season.id)
    }
    const roundTrip = deserializeGameWorldV4(serializeGameWorldV4(saveable, '2032-10-01T00:00:00.000Z'))
    expect(roundTrip.recruitProfilesById[profile.id]?.transferPortalEntryId).toBe(portalEntry.id)
    expect(roundTrip.transferPortalEntriesById[portalEntry.id]?.destinationTeamId).toBe(destinationTeamId)
    expect(Object.values(roundTrip.playerEnrollmentsById).filter((item) => item.playerId === playerId).map((item) => [item.teamId, item.status])).toContainEqual([sourceTeamId, 'ended'])
    expect(Object.values(roundTrip.playerEnrollmentsById).filter((item) => item.playerId === playerId).map((item) => [item.teamId, item.status])).toContainEqual([destinationTeamId, 'active'])

    const nbaSeason = Object.values(moved.value.seasons).find((item) => moved.value.ecosystems[moved.value.competitions[item.competitionId]!.ecosystemId]!.kind === 'nbaLike' && Object.values(moved.value.games).some((game) => game.seasonId === item.id))!
    let draftWorld = moved.value
    for (const game of Object.values(draftWorld.games).filter((item) => item.seasonId === nbaSeason.id)) draftWorld = applyMatchResult(draftWorld, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 96, awayScore: 83 })
    draftWorld = finalizeSeason(draftWorld, nbaSeason.id)
    const nbaCompetition = draftWorld.competitions[nbaSeason.competitionId]!
    const draft = Object.values(draftWorld.draftsById).find((item) => item.sourceSeasonId === nbaSeason.id)!
    const draftYear = Number(draft.scheduledOn.slice(0, 4))
    draftWorld = updateGameWorld(draftWorld, {
      currentDate: draft.rules.earlyEntryDeadline!,
      players: Object.values(draftWorld.players).map((player) => player.id === playerId ? { ...player, bio: { ...player.bio, dateOfBirth: createGameDate(draftYear - 19, 1, 1) } } : player),
      recruitProfiles: Object.values(draftWorld.recruitProfilesById).map((item) => item.id === profile.id ? { ...item, education: { highSchoolGraduationYear: draftYear - 1, completedUsHighSchool: true, enrolledAtUsCollege: true } } : item),
    })
    draftWorld = declareDraftEntry(draftWorld, draft.id, playerId)
    expect(getDraftCandidates(draftWorld, draft.id)).toContain(playerId)
    const draftPersonId = draftWorld.players[playerId]!.personId
    draftWorld = openDraft(updateGameWorld(draftWorld, { currentDate: draft.scheduledOn }), draft.id)
    const ownedPick = getCurrentDraftPick(draftWorld, draft.id)!
    draftWorld = makeDraftSelection(draftWorld, draft.id, ownedPick.ownerTeamId, playerId)
    const rights = Object.values(draftWorld.playerRightsById).find((item) => item.playerId === playerId && item.ownerTeamId === ownedPick.ownerTeamId)!
    draftWorld = signDraftRightsToNba(draftWorld, { id: 'transition:portal-draft-pro', playerId, toTeamId: ownedPick.ownerTeamId, rightsId: rights.id, annualSalary: 850_000, contractYears: 2 })
    const signedRights = draftWorld.playerRightsById[rights.id]!
    expect(draftWorld.players[playerId]!.personId).toBe(draftPersonId)
    expect(draftWorld.players[playerId]!.personId).toBe(personId)
    expect(draftWorld.teams[sourceTeamId]!.rosterPlayerIds).not.toContain(playerId)
    expect(draftWorld.teams[destinationTeamId]!.rosterPlayerIds).not.toContain(playerId)
    expect(draftWorld.teams[ownedPick.ownerTeamId]!.rosterPlayerIds).toContain(playerId)
    expect(draftWorld.transferPortalEntriesById[portalEntry.id]?.movement).toMatchObject({ playerId, sourceTeamId, destinationTeamId })
    expect(draftWorld.playerEnrollmentsById[sourceEnrollment.id]?.status).toBe('ended')
    expect(Object.values(draftWorld.playerEnrollmentsById).some((item) => item.id !== sourceEnrollment.id && item.playerId === playerId && item.teamId === destinationTeamId && item.status === 'ended')).toBe(true)
    expect(draftWorld.draftsById[draft.id]!.entries?.find((item) => item.playerId === playerId)?.history?.map((event) => event.status)).toEqual(['declaredEarlyEntry', 'finalPool', 'drafted'])
    expect(draftWorld.ecosystemTransitionsById['transition:portal-draft-pro']?.contractId).toBe(signedRights.contractId)
    const proRoundTrip = deserializeGameWorldV4(serializeGameWorldV4(draftWorld, '2032-10-01T00:00:00.000Z'))
    expect(proRoundTrip.transferPortalEntriesById[portalEntry.id]?.status).toBe('completed')
    expect(proRoundTrip.draftsById[draft.id]!.entries?.find((item) => item.playerId === playerId)?.status).toBe('drafted')
    expect(proRoundTrip.playerRightsById[rights.id]?.contractId).toBeDefined()
    expect(proRoundTrip.ecosystemTransitionsById['transition:portal-draft-pro']?.contractId).toBeDefined()
    expect(nbaCompetition.participantTeamIds).toContain(ownedPick.ownerTeamId)
  }, 20_000)
})
