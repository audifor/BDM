import { describe, expect, it } from 'vitest'

import { addDays, createGameDate } from '@/domain/date'
import { DEFAULT_FIBA_LIKE_ECOSYSTEM_ID } from '@/domain/ecosystem'
import { organizationIdForTeam, staffPersonIdFromString, teamStaffAssignmentIdFromString, teamIdFromString } from '@/domain/ids'
import { createCountry } from '@/domain/country'
import { createNewGame } from '@/app/game'
import { type EcosystemId } from '@/domain/ids'
import { createPlace } from '@/domain/facilities'
import { createStaffPerson, createTeamStaffAssignment } from '@/domain/staff'
import { createStaffEmployment } from '@/domain/staffCareer'
import { defaultRecruitingRules, recruitingRulesetForSeason } from '@/domain/recruiting'
import { createTalentCohort } from '@/domain/talent'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { createTalentSupplyCohort } from '@/engine/world/TalentSupply'
import { getEligibleScoutingEvaluators, progressScoutingAssignments, requestScouting } from '@/engine/scouting/ScoutingEngine'
import { decommitRecruitingProspect, designateOffCampusRecruiter, discoverRecruitingTalentCandidate, evaluateRecruitingChoice, generateRecruitingPool, performRecruitingAction, recordRecruitingEvaluation, promiseRecruitingRole, resolveRecruitingCommitments, makeRecruitingOffer, materializeRecruitingTalentCandidate, signCommittedRecruit, arriveSignedRecruits, selectAiNegotiationResponse, rankAiRecruitingTargets } from './RecruitingEngine'
import { applyRecruitingPressure, openAiRecruitingNegotiation, openRecruitingNegotiation, respondToRecruitingConcern } from './RecruitingNegotiationEngine'
import { performRecruitingGrayAction } from './RecruitingGrayActionEngine'

const home = teamIdFromString('team-home')
const away = teamIdFromString('team-away')

function recruitingWorld() {
  const world = createGameWorld(createValidGameWorldInput())
  return generateRecruitingPool(updateGameWorld(world, { recruitingCycles: [{ id: 'rpg-cycle', ecosystemId: DEFAULT_FIBA_LIKE_ECOSYSTEM_ID, sourceSeasonId: 'season-a' as never, targetSeasonId: 'season-a' as never, opensOn: createGameDate(2032, 10, 1), signingOn: createGameDate(2032, 11, 1), closesOn: createGameDate(2032, 12, 1), status: 'open', rules: { ...defaultRecruitingRules, poolSize: 5, commitmentThreshold: 1 } }] }), 'rpg-cycle')
}

describe('Recruiting RPG authority', () => {
  it('keeps preferences separate from basketball truth and starts with no program intel', () => {
    const world = recruitingWorld()
    const recruit = Object.values(world.recruitProfilesById)[0]!
    expect(recruit.recruitingRpg?.preferenceProfile.importance).toHaveProperty('familyTrust')
    expect(recruit.recruitingRpg?.intel).toEqual([])
    expect(recruit.recruitingRpg?.preferenceProfile.importance).not.toBe(world.players[recruit.playerId]!.basketball.ratings)
  })

  it('keeps the choice projection invariant when only hidden basketball ratings change', () => {
    const world = recruitingWorld()
    const recruit = Object.values(world.recruitProfilesById)[0]!
    const before = evaluateRecruitingChoice(world, recruit, home)
    const changed = updateGameWorld(world, { players: Object.values(world.players).map((player) => player.id === recruit.playerId ? { ...player, basketball: { ...player.basketball, ratings: Object.fromEntries(Object.keys(player.basketball.ratings).map((key) => [key, 100])) as typeof player.basketball.ratings } } : player) })
    expect(evaluateRecruitingChoice(changed, recruit, home)).toEqual(before)
  })

  it('learns a program-specific signal and keeps head-coach and recruiter relationships distinct', () => {
    const world = recruitingWorld()
    const recruit = Object.values(world.recruitProfilesById)[0]!
    const contacted = performRecruitingAction(world, 'rpg-cycle', recruit.id, home, 'contact')
    expect(contacted).toMatchObject({ ok: true })
    if (!contacted.ok) return
    const visited = performRecruitingAction(contacted.value, 'rpg-cycle', recruit.id, home, 'visit')
    expect(visited.ok).toBe(true)
    if (!visited.ok) return
    const state = visited.value.recruitProfilesById[recruit.id]!.recruitingRpg!
    expect(state.intel.find((item) => item.programTeamId === home)?.confidence).toBeGreaterThan(0)
    expect(state.intel.find((item) => item.programTeamId === away)).toBeUndefined()
    expect(state.relationships.some((item) => item.actor === 'recruiter' && item.programTeamId === home)).toBe(true)
    expect(state.relationships.some((item) => item.actor === 'headCoach' && item.programTeamId === home)).toBe(true)
  })

  it('records concerns, resolves a promise without losing it, and makes pressure affect the relationship', () => {
    let world = recruitingWorld()
    const recruit = Object.values(world.recruitProfilesById)[0]!
    const importance = Object.fromEntries(Object.keys(recruit.recruitingRpg!.preferenceProfile.importance).map((key) => [key, key === 'playingTime' ? 10 : key === 'roleClarity' ? 9 : 1])) as NonNullable<typeof recruit.recruitingRpg>['preferenceProfile']['importance']
    world = updateGameWorld(world, { recruitProfiles: Object.values(world.recruitProfilesById).map((item) => item.id === recruit.id ? { ...item, recruitingRpg: { ...item.recruitingRpg!, preferenceProfile: { ...item.recruitingRpg!.preferenceProfile, importance } } } : item) })
    const opened = openRecruitingNegotiation(world, 'rpg-cycle', recruit.id, home)
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    expect(opened.negotiation.unresolvedTopics).toHaveLength(2)
    const promised = respondToRecruitingConcern(opened.world, opened.negotiation.id, 'playingOpportunity', 'promise')
    expect(promised.ok).toBe(true)
    if (!promised.ok) return
    const promisedProfile = promised.world.recruitProfilesById[recruit.id]!
    expect(promisedProfile.recruitingRpg!.promises).toHaveLength(1)
    expect(promisedProfile.recruitingRpg!.negotiations![0]!.resolvedTopics).toContain('playingOpportunity')
    const beforePressure = promisedProfile.recruitingRpg!.relationships.find((item) => item.programTeamId === home && item.actor === 'program')!.trust
    const pressured = applyRecruitingPressure(promised.world, opened.negotiation.id)
    expect(pressured.ok).toBe(true)
    if (!pressured.ok) return
    const afterPressure = pressured.world.recruitProfilesById[recruit.id]!.recruitingRpg!.relationships.find((item) => item.programTeamId === home && item.actor === 'program')!.trust
    expect(pressured.negotiation.pressure).toBeGreaterThan(0)
    expect(afterPressure).toBeLessThan(beforePressure)
  })

  it('keeps AI negotiation selection invariant to hidden preference changes until its own intel changes', () => {
    const world = recruitingWorld()
    const recruit = Object.values(world.recruitProfilesById)[0]!
    const intel = { programTeamId: home, beliefs: { roleClarity: 'moderate' as const }, confidence: 55, discoveredOn: world.currentDate, sources: ['scouting'] }
    const withIntel = updateGameWorld(world, { recruitProfiles: Object.values(world.recruitProfilesById).map((item) => item.id === recruit.id ? { ...item, recruitingRpg: { ...item.recruitingRpg!, intel: [intel] } } : item) })
    const hiddenChanged = updateGameWorld(withIntel, {
      recruitProfiles: Object.values(withIntel.recruitProfilesById).map((item) => {
        if (item.id !== recruit.id || item.recruitingRpg === undefined) return item
        const importance = Object.fromEntries(Object.keys(item.recruitingRpg.preferenceProfile.importance).map((key) => [key, key === 'internationalSupport' ? 10 : 1])) as NonNullable<typeof recruit.recruitingRpg>['preferenceProfile']['importance']
        return { ...item, recruitingRpg: { ...item.recruitingRpg, preferenceProfile: { ...item.recruitingRpg.preferenceProfile, importance } } }
      }),
    })
    const actionContext = { cycleId: 'rpg-cycle', programTeamId: home, recruitId: recruit.id, date: world.currentDate, topic: 'role' as const, intelConfidence: 55, trust: 60, credibility: 60, hasOpenPosition: true, communication: 60 }
    expect(selectAiNegotiationResponse(actionContext)).toBe(selectAiNegotiationResponse(actionContext))
    const first = openAiRecruitingNegotiation(withIntel, 'rpg-cycle', recruit.id, home)
    const second = openAiRecruitingNegotiation(hiddenChanged, 'rpg-cycle', recruit.id, home)
    expect(first.ok && second.ok ? first.negotiation.unresolvedTopics : []).toEqual(['role'])
    expect(second.ok).toBe(true)
    if (!second.ok) return
    const revealed = updateGameWorld(hiddenChanged, { recruitProfiles: Object.values(hiddenChanged.recruitProfilesById).map((item) => item.id === recruit.id ? { ...item, recruitingRpg: { ...item.recruitingRpg!, intel: [{ ...intel, beliefs: { internationalSupport: 'high' as const } }] } } : item) })
    const adapted = openAiRecruitingNegotiation(revealed, 'rpg-cycle', recruit.id, home)
    expect(adapted.ok && adapted.negotiation.unresolvedTopics).toContain('internationalAdaptation')
  })

  it('selects AI responses from its own context and ignores rival private recruiting state', () => {
    const world = recruitingWorld()
    const recruit = Object.values(world.recruitProfilesById)[0]!
    const context = { cycleId: 'rpg-cycle', programTeamId: home, recruitId: recruit.id, date: world.currentDate, intelConfidence: 80, trust: 75, credibility: 75, hasOpenPosition: true, communication: 80 }
    const roleResponse = selectAiNegotiationResponse({ ...context, topic: 'role' })
    const distanceResponse = selectAiNegotiationResponse({ ...context, topic: 'familyDistance' })
    const strainedTrustResponse = selectAiNegotiationResponse({ ...context, topic: 'familyDistance', trust: 10, credibility: 10 })
    expect(['factualReassurance', 'promise']).toContain(roleResponse)
    expect(['redirect', 'delay']).toContain(distanceResponse)
    expect(strainedTrustResponse).toBe('refuse')

    const baselineOrder = rankAiRecruitingTargets(world, 'rpg-cycle', home).map((item) => item.id)
    const changed = updateGameWorld(world, {
      players: Object.values(world.players).map((player) => player.id === recruit.playerId ? { ...player, basketball: { ...player.basketball, ratings: Object.fromEntries(Object.keys(player.basketball.ratings).map((key) => [key, 99])) as typeof player.basketball.ratings } } : player),
      recruitProfiles: Object.values(world.recruitProfilesById).map((item) => item.id !== recruit.id || item.recruitingRpg === undefined ? item : { ...item, recruitingRpg: {
        ...item.recruitingRpg,
        preferenceProfile: { ...item.recruitingRpg.preferenceProfile, importance: Object.fromEntries(Object.keys(item.recruitingRpg.preferenceProfile.importance).map((key) => [key, key === 'distance' ? 10 : 1])) as typeof item.recruitingRpg.preferenceProfile.importance },
        intel: [...item.recruitingRpg.intel, { programTeamId: away, beliefs: { distance: 'high' as const }, confidence: 100, discoveredOn: world.currentDate, sources: ['private-rival-scout'] }],
        relationships: [...item.recruitingRpg.relationships, { programTeamId: away, actor: 'program' as const, familiarity: 100, rapport: 100, trust: 100, credibility: 100, updatedOn: world.currentDate }],
        promises: [...item.recruitingRpg.promises, { id: 'hidden-rival-promise', programTeamId: away, topic: 'role' as const, strength: 'explicit' as const, detail: 'private', madeOn: world.currentDate }],
        negotiations: [{ id: 'hidden-rival-negotiation', cycleId: 'rpg-cycle', recruitId: item.id, programTeamId: away, stage: 'counterposition' as const, currentConcerns: [], unresolvedTopics: ['role' as const], resolvedTopics: [], prospectRequests: [], programResponses: [], promisesProposed: ['hidden-rival-promise'], promisesAccepted: ['hidden-rival-promise'], rejectedAsks: [], pressure: 90, terminalState: 'active' as const }],
      } }),
    })
    expect(rankAiRecruitingTargets(changed, 'rpg-cycle', home).map((item) => item.id)).toEqual(baselineOrder)
    expect(selectAiNegotiationResponse({ ...context, topic: 'role' })).toBe(roleResponse)
  })

  it('resolves negative recruiting deterministically with short-term benefit and relationship cost', () => {
    const world = recruitingWorld()
    const recruit = Object.values(world.recruitProfilesById)[0]!
    const first = performRecruitingGrayAction(world, 'rpg-cycle', recruit.id, home, { tactic: 'unsupportedAllegation', targetProgramTeamId: away, evidenceSource: 'unsupported' })
    const repeated = performRecruitingGrayAction(world, 'rpg-cycle', recruit.id, home, { tactic: 'unsupportedAllegation', targetProgramTeamId: away, evidenceSource: 'unsupported' })
    expect(first.ok && repeated.ok).toBe(true)
    if (!first.ok || !repeated.ok) return
    const replay = performRecruitingGrayAction(first.value, 'rpg-cycle', recruit.id, home, { tactic: 'unsupportedAllegation', targetProgramTeamId: away, evidenceSource: 'unsupported' })
    expect(replay.ok).toBe(true)
    if (!replay.ok) return
    expect(replay.value).toBe(first.value)
    const event = first.value.recruitProfilesById[recruit.id]!.recruitingRpg!.negativeEvents!.at(-1)!
    const repeatedEvent = repeated.value.recruitProfilesById[recruit.id]!.recruitingRpg!.negativeEvents!.at(-1)!
    expect(event).toMatchObject({ truth: 'UNSUPPORTED', legality: 'MISLEADING', evidenceSource: 'unsupported' })
    expect(event.detectionRoll).toBe(repeatedEvent.detectionRoll)
    expect(event.detected).toBe(repeatedEvent.detected)
    expect(first.value.recruitingInterests.find((item) => item.recruitId === recruit.id && item.programTeamId === home)?.value).toBeGreaterThan(world.recruitingInterests.find((item) => item.recruitId === recruit.id && item.programTeamId === home)?.value ?? 0)
    expect(first.value.recruitProfilesById[recruit.id]!.recruitingRpg!.relationships.find((item) => item.programTeamId === away && item.actor === 'program')!.trust).toBeLessThan(50)
    expect(first.value.recruitProfilesById[recruit.id]!.recruitingRpg!.relationships.find((item) => item.programTeamId === home && item.actor === 'program')!.credibility).toBeLessThan(50)
  })

  it('routes legal, misleading, and detected rule-violating gray actions through canonical Enforcement', () => {
    let world = createNewGame()
    const season = Object.values(world.seasons).find((item) => world.ecosystems[world.competitions[item.competitionId]!.ecosystemId]!.kind === 'ncaaLike' && world.ecosystems[world.competitions[item.competitionId]!.ecosystemId]!.category === 'men')!
    const competition = world.competitions[season.competitionId]!
    const ecosystem = world.ecosystems[competition.ecosystemId]!
    const program = competition.participantTeamIds[0]!
    const rival = competition.participantTeamIds.find((teamId) => teamId !== program)!
    const positionCounts = world.teams[rival]!.rosterPlayerIds.reduce((counts, playerId) => { const position = world.players[playerId]?.basketball.primaryPosition; if (position) counts[position] = (counts[position] ?? 0) + 1; return counts }, {} as Partial<Record<'PG'|'SG'|'SF'|'PF'|'C', number>>)
    const position = (['PG','SG','SF','PF','C'] as const).find((candidate) => (positionCounts[candidate] ?? 0) >= 2)
    expect(position).toBeDefined()
    if (!position) return
    const cycle = { id: 'gray-enforcement-cycle', ecosystemId: ecosystem.id, sourceSeasonId: season.id, targetSeasonId: season.id, opensOn: world.currentDate, signingOn: world.currentDate, closesOn: season.endDate, status: 'open' as const, rules: { ...defaultRecruitingRules, poolSize: 1 }, calendar: recruitingRulesetForSeason('men', Number(season.startDate.slice(0, 4))) }
    world = updateGameWorld(world, { recruitingCycles: [...Object.values(world.recruitingCyclesById), cycle] })
    world = generateRecruitingPool(world, cycle.id)
    let recruit = Object.values(world.recruitProfilesById).find((item) => item.cycleId === cycle.id)!
    world = updateGameWorld(world, { recruitProfiles: Object.values(world.recruitProfilesById).map((item) => item.id === recruit.id ? { ...item, position } : item) })
    recruit = world.recruitProfilesById[recruit.id]!
    const beforeViolations = Object.keys(world.violationsById).length
    const factual = performRecruitingGrayAction(world, cycle.id, recruit.id, program, { tactic: 'rivalConcern', targetProgramTeamId: rival, evidenceSource: 'publicRoster' })
    expect(factual.ok).toBe(true)
    if (!factual.ok) return
    const factualEvent = factual.value.recruitProfilesById[recruit.id]!.recruitingRpg!.negativeEvents!.at(-1)!
    expect(factualEvent).toMatchObject({ truth: 'FACTUAL', legality: 'LEGAL_FACTUAL' })
    expect(Object.keys(factual.value.violationsById)).toHaveLength(beforeViolations)
    const misleading = performRecruitingGrayAction(factual.value, cycle.id, recruit.id, program, { tactic: 'unsupportedAllegation', targetProgramTeamId: rival, evidenceSource: 'unsupported' })
    expect(misleading.ok).toBe(true)
    if (!misleading.ok) return
    expect(misleading.value.recruitProfilesById[recruit.id]!.recruitingRpg!.negativeEvents!.at(-1)).toMatchObject({ truth: 'UNSUPPORTED', legality: 'MISLEADING' })
    expect(Object.keys(misleading.value.violationsById)).toHaveLength(beforeViolations)
    const unexposed = performRecruitingGrayAction(world, cycle.id, recruit.id, program, { tactic: 'unsupportedAllegation', targetProgramTeamId: rival, evidenceSource: 'unsupported' })
    const exposed = performRecruitingGrayAction(world, cycle.id, recruit.id, program, { tactic: 'unsupportedAllegation', targetProgramTeamId: rival, evidenceSource: 'publicRoster' })
    expect(exposed.ok).toBe(true)
    expect(unexposed.ok).toBe(true)
    if (exposed.ok && unexposed.ok) expect(exposed.value.recruitProfilesById[recruit.id]!.recruitingRpg!.negativeEvents!.at(-1)!.detectionRisk).toBeGreaterThan(unexposed.value.recruitProfilesById[recruit.id]!.recruitingRpg!.negativeEvents!.at(-1)!.detectionRisk)
    let detected = false
    for (let offset = 0; offset < 60 && !detected; offset += 1) {
      const atDate = updateGameWorld(misleading.value, { currentDate: addDays(misleading.value.currentDate, offset + 1) })
      const attempt = performRecruitingGrayAction(atDate, cycle.id, recruit.id, program, { tactic: 'impermissibleContact', targetProgramTeamId: rival, evidenceSource: 'publicRoster' })
      if (!attempt.ok) continue
      const event = attempt.value.recruitProfilesById[recruit.id]!.recruitingRpg!.negativeEvents!.at(-1)!
      if (!event.detected) continue
      detected = true
      expect(event.legality).toBe('RULE_VIOLATION')
      expect(event.violationId).toBeDefined()
      expect(event.investigationId).toBeDefined()
      expect(attempt.value.violationsById[event.violationId!]!.status).toBe('investigating')
      expect(attempt.value.investigationsById[event.investigationId!]?.violationIds).toContain(event.violationId)
      const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(attempt.value, `${atDate.currentDate}T00:00:00.000Z`))))
      expect(restored.recruitProfilesById[recruit.id]!.recruitingRpg!.negativeEvents!.find((item) => item.id === event.id)).toEqual(event)
      expect(restored.violationsById[event.violationId!]).toEqual(attempt.value.violationsById[event.violationId!])
      expect(restored.investigationsById[event.investigationId!]).toEqual(attempt.value.investigationsById[event.investigationId!])
      const replay = performRecruitingGrayAction(restored, cycle.id, recruit.id, program, { tactic: 'impermissibleContact', targetProgramTeamId: rival, evidenceSource: 'publicRoster' })
      expect(replay.ok).toBe(true)
      if (replay.ok) expect(replay.value).toBe(restored)
    }
    expect(detected).toBe(true)
  })

  it('records role promises, flags same-position contradiction in history, and preserves RPG state in Save V4', () => {
    let world = recruitingWorld()
    const [first, second] = Object.values(world.recruitProfilesById)
    expect(first).toBeDefined(); expect(second).toBeDefined()
    const promise = promiseRecruitingRole(world, 'rpg-cycle', first!.id, home, 'explicit')
    expect(promise.ok).toBe(true)
    if (!promise.ok) return
    const replay = promiseRecruitingRole(promise.value, 'rpg-cycle', first!.id, home, 'explicit')
    expect(replay.ok).toBe(true)
    if (!replay.ok) return
    expect(replay.value).toBe(promise.value)
    world = promise.value
    const samePosition = Object.values(world.recruitProfilesById).find((item) => item.id !== first!.id && item.position === first!.position)
    if (!samePosition) return
    const secondPromise = promiseRecruitingRole(world, 'rpg-cycle', samePosition.id, home, 'explicit')
    expect(secondPromise.ok).toBe(true)
    if (!secondPromise.ok) return
    expect(secondPromise.value.recruitProfilesById[samePosition.id]!.recruitingRpg!.story.at(-1)).toContain('conflicts')
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(secondPromise.value, '2032-10-01T00:00:00.000Z'))))
    expect(restored.recruitProfilesById[first!.id]!.recruitingRpg).toEqual(secondPromise.value.recruitProfilesById[first!.id]!.recruitingRpg)
  })

  it('honors configured per-cycle shutdown windows', () => {
    const world = recruitingWorld()
    const cycle = world.recruitingCyclesById['rpg-cycle']!
    const configured = updateGameWorld(world, { recruitingCycles: [{ ...cycle, calendar: { version: 'fixture-1', source: 'test fixture', windows: [{ startsOn: world.currentDate, endsOn: world.currentDate, period: 'shutdown' as const }] } }] })
    const recruit = Object.values(configured.recruitProfilesById)[0]!
    expect(performRecruitingAction(configured, cycle.id, recruit.id, home, 'contact')).toMatchObject({ ok: false, reason: 'RECRUITING_SHUTDOWN' })
  })

  it('materializes an international TalentCohort prospect as one canonical Player', () => {
    let world = recruitingWorld()
    const foreignCountry = createCountry({ id: 'country:international-test' as never, name: 'International', code: 'INT' })
    world = updateGameWorld(world, { countries: [...Object.values(world.countries), foreignCountry] })
    const place = createPlace({ id: 'intl-place', kind: 'CITY', name: 'International academy', countryId: foreignCountry.id })
    world = updateGameWorld(world, { places: [...Object.values(world.placesById), place] })
    world = createTalentSupplyCohort(world, createTalentCohort({ id: 'intl-cohort', placeId: place.id, birthYear: 2009, generationYear: 2032, gender: 'male', seed: 812, inputVersion: 'fixture-v1', inputs: { ageCohortPopulation: 20000, basketballParticipationPerThousand: 60, accessOpportunityBasisPoints: 9000 } }))
    const discovered = materializeRecruitingTalentCandidate(world, 'rpg-cycle', 'intl-cohort', 1)
    expect(discovered.ok).toBe(true)
    if (!discovered.ok) return
    const profile = Object.values(discovered.value.recruitProfilesById).find((item) => item.playerId === discovered.value.talentMaterializationsByCandidateKey['intl-cohort:candidate:000001']!.playerId)!
    expect(profile.origin).toBe('international')
    const repeated = materializeRecruitingTalentCandidate(discovered.value, 'rpg-cycle', 'intl-cohort', 1)
    expect(repeated.ok && Object.values(repeated.value.recruitProfilesById).filter((item) => item.playerId === profile.playerId)).toHaveLength(1)
  })

  it('discovers at most one NCAA TalentCohort prospect through the user-facing intake route', () => {
    let world = createNewGame()
    const cycle = Object.values(world.recruitingCyclesById).find((item) => world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike' && world.ecosystems[item.ecosystemId]?.category === 'men')!
    const ecosystem = world.ecosystems[cycle.ecosystemId]!
    let calendar = recruitingRulesetForSeason(ecosystem.category, Number(world.seasons[cycle.targetSeasonId]?.startDate.slice(0, 4) ?? world.currentDate.slice(0, 4)))
    const competition = Object.values(world.competitions).find((item) => item.ecosystemId === cycle.ecosystemId)!
    const season = Object.values(world.seasons).find((item) => item.competitionId === competition.id)!
    const participants = competition.participantTeamIds
    const program = participants.find((teamId) => getEligibleScoutingEvaluators(world, teamId, 'FULL_REPORT').length > 0) ?? participants[0]!
    world = updateGameWorld(world, { currentSeasonId: season.id, recruitingCycles: Object.values(world.recruitingCyclesById).map((item) => item.id === cycle.id ? { ...item, status: 'open' as const, sourceSeasonId: season.id, targetSeasonId: season.id, closesOn: season.endDate } : item) })
    const country = createCountry({ id: 'country:recruiting-discovery' as never, name: 'Discovery', code: 'DSC' })
    const place = createPlace({ id: 'recruiting-discovery-place', kind: 'CITY', name: 'Discovery', countryId: country.id })
    world = updateGameWorld(world, { countries: [...Object.values(world.countries), country], places: [...Object.values(world.placesById), place] })
    const cohort = createTalentCohort({ id: 'automatic-recruiting-intake', placeId: place.id, birthYear: Number(world.currentDate.slice(0, 4)) - 17, generationYear: Number(world.currentDate.slice(0, 4)), gender: ecosystem.category === 'men' ? 'male' : 'female', seed: 441, inputVersion: 'fixture-v1', inputs: { ageCohortPopulation: 20000, basketballParticipationPerThousand: 60, accessOpportunityBasisPoints: 9000 } })
    world = createTalentSupplyCohort(world, cohort)
    const before = Object.values(world.recruitProfilesById).filter((item) => item.cycleId === cycle.id).length
    const first = discoverRecruitingTalentCandidate(world, cycle.id, program)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(Object.values(first.value.recruitProfilesById).filter((item) => item.cycleId === cycle.id)).toHaveLength(before + 1)
    expect(first.value.recruitingBoards.some((item) => item.programTeamId === program)).toBe(true)
    expect(Object.keys(first.value.talentMaterializationsByCandidateKey)).toHaveLength(1)
    const materialization = Object.values(first.value.talentMaterializationsByCandidateKey)[0]!
    const recruit = Object.values(first.value.recruitProfilesById).find((item) => item.playerId === materialization.playerId)!
    const organizationId = organizationIdForTeam(program)
    expect(first.value.organizationPlayerAwarenessById[`player-awareness:${organizationId}:${materialization.playerId}`]).toMatchObject({ source: 'RECRUITING_DISCOVERY', playerId: materialization.playerId })
    expect(first.value.organizationKnowledge.some((item) => item.organizationId === organizationId && item.subjectPlayerId === materialization.playerId)).toBe(false)
    const sourceStaff = Object.values(first.value.staffPeopleById)[0]!
    const scoutingStaffId = staffPersonIdFromString('recruiting-discovery-scout')
    const scoutingStaff = createStaffPerson({ id: scoutingStaffId, identity: sourceStaff.identity, professional: sourceStaff.professional, marketRole: 'regionalScout', roleFamily: 'scouting' })
    const scoutingAssignment = createTeamStaffAssignment({ id: teamStaffAssignmentIdFromString('recruiting-discovery-scout-assignment'), staffPersonId: scoutingStaffId, teamId: program, role: 'regionalScout', assignedOn: first.value.currentDate })
    const withScoutingStaff = updateGameWorld(first.value, { staffPeople: [...Object.values(first.value.staffPeopleById), scoutingStaff], teamStaffAssignments: [...Object.values(first.value.teamStaffAssignmentsById), scoutingAssignment], staffEmploymentByStaffId: { ...first.value.staffEmploymentByStaffId, [scoutingStaffId]: createStaffEmployment({ status: 'employed', teamId: program, roleId: 'regionalScout', startedOn: first.value.currentDate }) } })
    const evaluators = getEligibleScoutingEvaluators(withScoutingStaff, program, 'FULL_REPORT')
    expect(evaluators.length).toBeGreaterThan(0)
    if (evaluators.length === 0) return
    let scouted = requestScouting(withScoutingStaff, { organizationId, playerId: materialization.playerId, missionType: 'FULL_REPORT', evaluatorStaffId: evaluators[0]! })
    for (let day = 0; day < 12 && Object.values(scouted.scoutingAssignmentsById).some((item) => item.status !== 'COMPLETED' && item.status !== 'CANCELLED'); day += 1) {
      scouted = progressScoutingAssignments(updateGameWorld(scouted, { currentDate: addDays(scouted.currentDate, 1) }))
    }
    expect(Object.values(scouted.evaluatorReportsById).some((report) => report.subjectPlayerId === materialization.playerId && report.organizationId === organizationId)).toBe(true)
    expect(scouted.organizationKnowledge.some((item) => item.organizationId === organizationId && item.subjectPlayerId === materialization.playerId)).toBe(true)
    expect(recruit.playerId).toBe(materialization.playerId)
    expect(rankAiRecruitingTargets(scouted, cycle.id, program).some((item) => item.playerId === materialization.playerId)).toBe(true)

    const canonicalPlayer = scouted.players[materialization.playerId]!
    const personId = canonicalPlayer.personId!
    expect(scouted.personsById[personId]).toBeDefined()
    let signingYear = Math.max(Number(season.startDate.slice(0, 4)), Number(scouted.currentDate.slice(0, 4)))
    const secondWednesdayOfNovember = (year: number) => { const days = Array.from({ length: 14 }, (_, index) => index + 1).filter((day) => new Date(Date.UTC(year, 10, day)).getUTCDay() === 3); return createGameDate(year, 11, days[1]!) }
    if (secondWednesdayOfNovember(signingYear) <= scouted.currentDate) signingYear += 1
    calendar = recruitingRulesetForSeason('men', signingYear)
    let recruiting = updateGameWorld(scouted, { currentSeasonId: season.id, recruitingCycles: Object.values(scouted.recruitingCyclesById).map((item) => item.id === cycle.id ? { ...item, status: 'open' as const, calendar, rules: { ...item.rules, commitmentThreshold: -100 }, institutionalSigningPolicies: [{ programTeamId: program, seasonId: season.id, finalAidSigningDate: createGameDate(signingYear + 1, 8, 1), provenance: 'SIMULATED_CARRY_FORWARD' as const, basedOnSeasonId: season.id }] } : item) })
    const recruiterId = Object.values(recruiting.teamStaffAssignmentsById).find((item) => item.teamId === program && ['recruitingCoordinator','positionalRecruiter'].includes(item.role))?.staffPersonId ?? Object.values(recruiting.teamStaffAssignmentsById).find((item) => item.teamId === program && ['assistantCoach','associateCoach'].includes(item.role))?.staffPersonId ?? recruiting.coaches[recruiting.teams[program]!.coachId!]!.staffProfileId!
    const designated = designateOffCampusRecruiter(recruiting, cycle.id, program, recruiterId)
    expect(designated.ok).toBe(true)
    if (!designated.ok) throw new Error(`international recruiter designation failed: ${designated.reason}`)
    recruiting = designated.value
    const contacted = performRecruitingAction(recruiting, cycle.id, recruit.id, program, 'pitch')
    expect(contacted.ok).toBe(true)
    if (!contacted.ok) throw new Error(`international contact failed: ${contacted.reason}`)
    recruiting = contacted.value
    const visit = performRecruitingAction(recruiting, cycle.id, recruit.id, program, 'visit', { type: 'unofficial', startsOn: recruiting.currentDate, endsOn: recruiting.currentDate, lodgingNights: 0 })
    expect(visit.ok).toBe(true)
    if (!visit.ok) throw new Error(`international visit failed: ${visit.reason}`)
    recruiting = visit.value
    const rolePromise = promiseRecruitingRole(recruiting, cycle.id, recruit.id, program, 'assurance')
    expect(rolePromise.ok).toBe(true)
    if (!rolePromise.ok) throw new Error(`international role promise failed: ${rolePromise.reason}`)
    recruiting = rolePromise.value
    expect(recruiting.players[materialization.playerId]!.personId).toBe(personId)
    recruiting = updateGameWorld(recruiting, { currentDate: addDays(recruiting.currentDate, 1) })
    const opened = openAiRecruitingNegotiation(recruiting, cycle.id, recruit.id, program)
    if (!opened.ok) throw new Error(`international negotiation failed: ${opened.reason}`)
    expect(opened.ok).toBe(true)
    const topic = opened.negotiation.unresolvedTopics[0]!
    const response = respondToRecruitingConcern(opened.world, opened.negotiation.id, topic, 'explanation')
    expect(response.ok).toBe(true)
    if (!response.ok) throw new Error(`international response failed: ${response.reason}`)
    const targetProgram = competition.participantTeamIds.find((teamId) => teamId !== program)!
    const grayWorld = updateGameWorld(response.world, { currentDate: addDays(response.world.currentDate, 1) })
    const gray = performRecruitingGrayAction(grayWorld, cycle.id, recruit.id, program, { tactic: 'unsupportedAllegation', targetProgramTeamId: targetProgram, evidenceSource: 'unsupported' })
    expect(gray.ok, gray.ok ? undefined : gray.reason).toBe(true)
    if (!gray.ok) throw new Error(`international gray action failed: ${gray.reason}`)
    const offer = makeRecruitingOffer(gray.value, cycle.id, recruit.id, program)
    expect(offer.ok).toBe(true)
    if (!offer.ok) throw new Error(`international offer failed: ${offer.reason}`)
    recruiting = resolveRecruitingCommitments(offer.value, cycle.id)
    if (!recruiting.recruitingCommitmentsById[`commitment:${cycle.id}:${recruit.id}`]) throw new Error(`international verbal commitment missing: ${JSON.stringify({ profile: recruiting.recruitProfilesById[recruit.id]?.status, choice: evaluateRecruitingChoice(recruiting, recruiting.recruitProfilesById[recruit.id]!, program), offers: Object.values(recruiting.recruitingOffersById).filter((item) => item.recruitId === recruit.id) })}`)
    expect(recruiting.recruitingCommitmentsById[`commitment:${cycle.id}:${recruit.id}`]?.programTeamId).toBe(program)
    expect(recruiting.recruitProfilesById[recruit.id]!.playerId).toBe(materialization.playerId)
    recruiting = updateGameWorld(recruiting, { currentDate: secondWednesdayOfNovember(signingYear) })
    const signed = signCommittedRecruit(recruiting, cycle.id, recruit.id)
    expect(signed.ok).toBe(true)
    if (!signed.ok) throw new Error(`international signing failed: ${signed.reason}`)
    expect(signed.value.recruitSigningsById[`signing:${cycle.id}:${recruit.id}`]?.playerId).toBe(materialization.playerId)
    expect(signed.value.players[materialization.playerId]!.personId).toBe(personId)
    const enrolledWorld = arriveSignedRecruits(updateGameWorld(signed.value, { currentDate: createGameDate(signingYear + 1, 1, 15), currentSeasonId: season.id }))
    expect(enrolledWorld.recruitProfilesById[recruit.id]!.status).toBe('arrived')
    expect(enrolledWorld.teams[program]!.rosterPlayerIds.filter((id) => id === materialization.playerId)).toHaveLength(1)
    expect(Object.values(enrolledWorld.playerEnrollmentsById).filter((item) => item.playerId === materialization.playerId && item.status === 'active')).toHaveLength(1)
    expect(Object.values(enrolledWorld.collegeEligibilityAssessmentsById).find((item) => item.playerId === materialization.playerId)?.eligible).toBe(true)
    expect(enrolledWorld.players[materialization.playerId]!.personId).toBe(personId)
    expect(arriveSignedRecruits(enrolledWorld).teams[program]!.rosterPlayerIds.filter((id) => id === materialization.playerId)).toHaveLength(1)
    expect(openAiRecruitingNegotiation(enrolledWorld, cycle.id, recruit.id, program)).toMatchObject({ ok: false, reason: 'INVALID_RECRUIT' })
    const persistedFixture = updateGameWorld(enrolledWorld, { recruitProfiles: Object.values(enrolledWorld.recruitProfilesById).map((item) => item.id === recruit.id ? { ...item, recruitingRpg: { ...item.recruitingRpg!, stakeholders: [{ id: 'bs15e-persistence-parent', role: 'parent' as const, influence: 72, preference: 'playingTime' as const, attitudeByProgram: { [String(program)]: 25 } }] } } : item) })
    const v4 = JSON.parse(JSON.stringify(serializeGameWorldV4(persistedFixture, `${persistedFixture.currentDate}T00:00:00.000Z`)))
    const restored = deserializeGameWorldV4(v4)
    expect(restored.recruitProfilesById[recruit.id]).toEqual(persistedFixture.recruitProfilesById[recruit.id])
    expect(restored.recruitingCyclesById[cycle.id]).toEqual(persistedFixture.recruitingCyclesById[cycle.id])
    expect(restored.recruitingActionHistoryById).toEqual(persistedFixture.recruitingActionHistoryById)
    expect(restored.recruitingVisitsById).toEqual(persistedFixture.recruitingVisitsById)
    expect(restored.recruitSigningsById).toEqual(persistedFixture.recruitSigningsById)
    expect(restored.playerEnrollmentsById).toEqual(persistedFixture.playerEnrollmentsById)
    expect(restored.collegeEligibilityAssessmentsById).toEqual(persistedFixture.collegeEligibilityAssessmentsById)
    expect(restored.talentMaterializationsByCandidateKey).toEqual(persistedFixture.talentMaterializationsByCandidateKey)

    const oldV4 = structuredClone(v4) as { payload: { recruitProfiles: Record<string, unknown>[]; recruitingCycles: Record<string, unknown>[] } }
    oldV4.payload.recruitProfiles = oldV4.payload.recruitProfiles.map(({ recruitingRpg: _rpg, ...profile }) => profile)
    oldV4.payload.recruitingCycles = oldV4.payload.recruitingCycles.map(({ calendar: _calendar, staffDesignations: _staff, institutionalSigningPolicies: _policies, ...cycleRecord }) => cycleRecord)
    const legacyLoaded = deserializeGameWorldV4(oldV4)
    expect(legacyLoaded.recruitProfilesById[recruit.id]!.recruitingRpg).toBeUndefined()
    expect(legacyLoaded.recruitingCyclesById[cycle.id]!.calendar).toBeUndefined()
    expect(legacyLoaded.recruitingCyclesById[cycle.id]!.staffDesignations).toBeUndefined()
  })

  it('keeps canonical off-campus recruiter designation stable and records person-days through contact', () => {
    let world = createNewGame()
    const sourceCycle = Object.values(world.recruitingCyclesById).find((item) => world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')!
    const ecosystem = world.ecosystems[sourceCycle.ecosystemId]!
    const program = Object.values(world.competitions).find((item) => item.ecosystemId === sourceCycle.ecosystemId)!.participantTeamIds[0]!
    const staffId = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === program)!.staffPersonId
    const calendar = recruitingRulesetForSeason(ecosystem.category, 2026)
    const cycle = { ...sourceCycle, status: 'open' as const, calendar }
    world = updateGameWorld(world, { currentDate: createGameDate(2026, 10, 20), recruitingCycles: Object.values(world.recruitingCyclesById).map((item) => item.id === cycle.id ? cycle : item) })
    world = generateRecruitingPool(world, cycle.id)
    const recruit = Object.values(world.recruitProfilesById).find((item) => item.cycleId === cycle.id)!
    world = updateGameWorld(world, { recruitProfiles: Object.values(world.recruitProfilesById).map((item) => item.id === recruit.id ? { ...item, education: { highSchoolGraduationYear: 2028, juniorYearOpeningOn: createGameDate(2026, 8, 1), seniorYearOpeningOn: createGameDate(2027, 8, 1) } } : item) })
    const action = { type: 'unofficial' as const, startsOn: world.currentDate, endsOn: world.currentDate, lodgingNights: 0, offCampus: true, offCampusSite: 'educationalInstitution' as const, staffPersonId: staffId }
    expect(performRecruitingAction(world, cycle.id, recruit.id, program, 'contact', action)).toMatchObject({ ok: false, reason: 'STAFF_NOT_DESIGNATED_OFF_CAMPUS_RECRUITER' })
    const designation = designateOffCampusRecruiter(world, cycle.id, program, staffId)
    expect(designation.ok).toBe(true)
    if (!designation.ok) return
    const contacted = performRecruitingAction(designation.value, cycle.id, recruit.id, program, 'contact', action)
    if (!contacted.ok) throw new Error(`off-campus contact failed: ${contacted.reason}`)
    if (!contacted.ok) return
    expect(contacted.value.recruitingActionHistoryById[Object.keys(contacted.value.recruitingActionHistoryById).at(-1)!]?.offCampus).toBe(true)
    expect(recordRecruitingEvaluation(contacted.value, { cycleId: cycle.id, recruitId: recruit.id, programTeamId: program, eventType: 'scholastic', eventApproved: true, offCampus: true, staffPersonId: staffId })).toMatchObject({ ok: false, reason: 'STAFF_HIGH_TOUCH_ACTIVITY_CONFLICT' })
    const persistedCycle = contacted.value.recruitingCyclesById[cycle.id]!
    expect(persistedCycle.staffDesignations).toHaveLength(1)
    expect(designateOffCampusRecruiter(contacted.value, cycle.id, program, staffId).ok).toBe(true)
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(contacted.value, `${world.currentDate}T00:00:00.000Z`))))
    expect(restored.recruitingCyclesById[cycle.id]!.staffDesignations).toEqual(persistedCycle.staffDesignations)
    expect(restored.recruitingActionHistoryById).toEqual(contacted.value.recruitingActionHistoryById)
    const repeated = performRecruitingAction(contacted.value, cycle.id, recruit.id, program, 'contact', action)
    expect(repeated.ok).toBe(true)
    if (repeated.ok) expect(Object.values(repeated.value.recruitingActionHistoryById).filter((item) => item.offCampus && item.staffPersonId === staffId && item.date === world.currentDate)).toHaveLength(2)
  })

  it('limits a cycle to six off-campus recruiters and replaces only after canonical Staff attrition', () => {
    let world = createNewGame()
    const sourceCycle = Object.values(world.recruitingCyclesById).find((item) => world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')!
    const ecosystem = world.ecosystems[sourceCycle.ecosystemId]!
    const program = Object.values(world.competitions).find((item) => item.ecosystemId === sourceCycle.ecosystemId)!.participantTeamIds[0]!
    const cycle = { ...sourceCycle, calendar: recruitingRulesetForSeason(ecosystem.category, 2026) }
    const date = createGameDate(2026, 10, 20)
    const sourceStaff = Object.values(world.staffPeopleById)[0]!
    const replacements = Array.from({ length: 7 }, (_, index) => {
      const id = staffPersonIdFromString(`bs15e-staff-gate-${index + 1}`)
      const person = createStaffPerson({ id, identity: { firstName: `Gate${index + 1}`, lastName: 'Recruiter' }, professional: sourceStaff.professional })
      const assignment = createTeamStaffAssignment({ id: teamStaffAssignmentIdFromString(`bs15e-staff-gate-assignment-${index + 1}`), staffPersonId: id, teamId: program, role: 'assistantCoach', assignedOn: date })
      return { person, assignment }
    })
    world = updateGameWorld(world, {
      currentDate: date,
      recruitingCycles: Object.values(world.recruitingCyclesById).map((item) => item.id === cycle.id ? cycle : item),
      staffPeople: [...Object.values(world.staffPeopleById), ...replacements.map((item) => item.person)],
      teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), ...replacements.map((item) => item.assignment)],
      staffEmploymentByStaffId: { ...world.staffEmploymentByStaffId, ...Object.fromEntries(replacements.map(({ person }) => [person.id, createStaffEmployment({ status: 'employed', teamId: program, roleId: 'assistantCoach', startedOn: date })])) },
    })
    for (const { person } of replacements.slice(0, 6)) {
      const result = designateOffCampusRecruiter(world, cycle.id, program, person.id)
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(`expected six Recruiter designations; got ${result.reason}`)
      world = result.value
    }
    const seventh = replacements[6]!
    expect(designateOffCampusRecruiter(world, cycle.id, program, seventh.person.id)).toMatchObject({ ok: false, reason: 'OFF_CAMPUS_RECRUITER_DESIGNATION_LIMIT' })

    const departed = replacements[1]!
    world = updateGameWorld(world, {
      teamStaffAssignments: Object.values(world.teamStaffAssignmentsById).filter((item) => item.id !== departed.assignment.id),
      staffEmploymentByStaffId: { ...world.staffEmploymentByStaffId, [departed.person.id]: { status: 'unemployed' } },
      recruitingCycles: Object.values(world.recruitingCyclesById).map((item) => item.id === cycle.id ? { ...item, status: 'open' as const, rules: { ...item.rules, poolSize: 2 } } : item),
    })
    world = generateRecruitingPool(world, cycle.id)
    const recruit = Object.values(world.recruitProfilesById).find((item) => item.cycleId === cycle.id)!
    expect(performRecruitingAction(world, cycle.id, recruit.id, program, 'contact', { type: 'unofficial', startsOn: date, endsOn: date, lodgingNights: 0, staffPersonId: departed.person.id })).toMatchObject({ ok: false, reason: 'RECRUITING_STAFF_REQUIRED' })
    const replacement = designateOffCampusRecruiter(world, cycle.id, program, seventh.person.id, 'Replacement after Staff departure')
    expect(replacement.ok).toBe(true)
    if (!replacement.ok) throw new Error(`legitimate Staff replacement failed: ${replacement.reason}`)
    const designations = replacement.value.recruitingCyclesById[cycle.id]!.staffDesignations!
    expect(designations.every((item) => item.recruitingCycleId === cycle.id)).toBe(true)
    expect(designations.filter((item) => item.active)).toHaveLength(6)
    expect(designations.find((item) => item.staffId === departed.person.id)).toMatchObject({ active: false, effectiveTo: date })
    expect(designations.find((item) => item.staffId === seventh.person.id)).toMatchObject({ active: true, source: 'staffAttritionReplacement' })
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(replacement.value, `${date}T00:00:00.000Z`))))
    expect(restored.recruitingCyclesById[cycle.id]!.staffDesignations).toEqual(designations)
  })

  it('applies the shared off-campus recruiter and person-day authority to all modeled Staff actions', () => {
    let world = createNewGame()
    const sourceCycle = Object.values(world.recruitingCyclesById).find((item) => world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike' && world.ecosystems[item.ecosystemId]?.category === 'men')!
    const competition = Object.values(world.competitions).find((item) => item.ecosystemId === sourceCycle.ecosystemId)!
    const program = competition.participantTeamIds[0]!
    const aiProgram = competition.participantTeamIds.find((teamId) => teamId !== program && world.teams[teamId]?.coachId !== world.userCoachId)!
    const date = createGameDate(2026, 10, 20)
    const calendar = recruitingRulesetForSeason('men', 2026)
    const sourceStaff = Object.values(world.staffPeopleById)[0]!
    const staff = Array.from({ length: 5 }, (_, index) => {
      const id = staffPersonIdFromString(`bs15e-daily-recruiter-${index + 1}`)
      const person = createStaffPerson({ id, identity: { firstName: `Daily${index + 1}`, lastName: 'Recruiter' }, professional: sourceStaff.professional })
      const assignment = createTeamStaffAssignment({ id: teamStaffAssignmentIdFromString(`bs15e-daily-recruiter-assignment-${index + 1}`), staffPersonId: id, teamId: program, role: 'assistantCoach', assignedOn: date })
      return { id, person, assignment }
    })
    const aiStaff = Array.from({ length: 5 }, (_, index) => {
      const id = staffPersonIdFromString(`bs15e-ai-daily-recruiter-${index + 1}`)
      const person = createStaffPerson({ id, identity: { firstName: `AI${index + 1}`, lastName: 'Recruiter' }, professional: sourceStaff.professional })
      const assignment = createTeamStaffAssignment({ id: teamStaffAssignmentIdFromString(`bs15e-ai-daily-recruiter-assignment-${index + 1}`), staffPersonId: id, teamId: aiProgram, role: 'assistantCoach', assignedOn: date })
      return { id, person, assignment }
    })
    const cycle = { ...sourceCycle, status: 'open' as const, calendar, rules: { ...sourceCycle.rules, poolSize: 8 } }
    world = updateGameWorld(world, {
      currentDate: date,
      recruitingCycles: Object.values(world.recruitingCyclesById).map((item) => item.id === cycle.id ? cycle : item),
      staffPeople: [...Object.values(world.staffPeopleById), ...staff.map((item) => item.person), ...aiStaff.map((item) => item.person)],
      teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), ...staff.map((item) => item.assignment), ...aiStaff.map((item) => item.assignment)],
      staffEmploymentByStaffId: { ...world.staffEmploymentByStaffId, ...Object.fromEntries([...staff.map((item) => [item.id, createStaffEmployment({ status: 'employed', teamId: program, roleId: 'assistantCoach', startedOn: date })] as const), ...aiStaff.map((item) => [item.id, createStaffEmployment({ status: 'employed', teamId: aiProgram, roleId: 'assistantCoach', startedOn: date })] as const)]) },
    })
    world = generateRecruitingPool(world, cycle.id)
    let recruits = Object.values(world.recruitProfilesById).filter((item) => item.cycleId === cycle.id).slice(0, 5)
    world = updateGameWorld(world, { recruitProfiles: Object.values(world.recruitProfilesById).map((item) => recruits.some((recruit) => recruit.id === item.id) ? { ...item, education: { highSchoolGraduationYear: 2028, juniorYearOpeningOn: createGameDate(2026, 8, 1), seniorYearOpeningOn: createGameDate(2027, 8, 1) } } : item) })
    recruits = recruits.map((item) => world.recruitProfilesById[item.id]!)
    for (const actor of staff) {
      const designated = designateOffCampusRecruiter(world, cycle.id, program, actor.id)
      expect(designated.ok).toBe(true)
      if (!designated.ok) return
      world = designated.value
    }
    const offCampus = (staffPersonId: typeof staff[number]['id']) => ({ type: 'unofficial' as const, startsOn: date, endsOn: date, lodgingNights: 0, offCampus: true, offCampusSite: 'educationalInstitution' as const, staffPersonId })
    for (let index = 0; index < 4; index += 1) {
      const contact = performRecruitingAction(world, cycle.id, recruits[index]!.id, program, 'contact', offCampus(staff[index]!.id))
      expect(contact.ok, contact.ok ? undefined : contact.reason).toBe(true)
      if (!contact.ok) return
      world = contact.value
    }
    expect(performRecruitingAction(world, cycle.id, recruits[4]!.id, program, 'contact', offCampus(staff[4]!.id))).toMatchObject({ ok: false, reason: 'OFF_CAMPUS_RECRUITER_DAILY_LIMIT' })
    const evaluationDate = addDays(date, 1)
    world = updateGameWorld(world, { currentDate: evaluationDate })
    const evaluation = recordRecruitingEvaluation(world, { cycleId: cycle.id, recruitId: recruits[4]!.id, programTeamId: program, eventType: 'scholastic', eventApproved: true, offCampus: true, staffPersonId: staff[4]!.id })
    expect(evaluation.ok).toBe(true)
    if (!evaluation.ok) return
    world = evaluation.value
    const evaluationRecord = Object.values(world.recruitingActionHistoryById).find((item) => item.kind === 'evaluation')!
    expect(evaluationRecord).toMatchObject({ offCampus: true, staffPersonId: staff[4]!.id, countsAsOpportunity: true })
    const remote = performRecruitingAction(world, cycle.id, recruits[4]!.id, program, 'pitch')
    expect(remote.ok).toBe(true)
    if (!remote.ok) return
    const offCampusDays = new Set(Object.values(remote.value.recruitingActionHistoryById).filter((item) => item.programTeamId === program && item.offCampus).map((item) => `${item.staffPersonId}:${item.date}`))
    expect(offCampusDays.size).toBe(5)
    expect(Object.values(remote.value.recruitingActionHistoryById).find((item) => item.kind === 'pitch')?.offCampus).toBe(false)

    expect(world.teams[aiProgram]!.coachId).not.toBe(world.userCoachId)
    let aiWorld = updateGameWorld(remote.value, { currentDate: addDays(evaluationDate, 1) })
    for (const actor of aiStaff) {
      const designated = designateOffCampusRecruiter(aiWorld, cycle.id, aiProgram, actor.id)
      expect(designated.ok).toBe(true)
      if (!designated.ok) return
      aiWorld = designated.value
    }
    for (let index = 0; index < 4; index += 1) {
      const action = performRecruitingAction(aiWorld, cycle.id, recruits[index]!.id, aiProgram, 'contact', offCampus(aiStaff[index]!.id))
      expect(action.ok, action.ok ? undefined : action.reason).toBe(true)
      if (!action.ok) return
      aiWorld = action.value
    }
    expect(performRecruitingAction(aiWorld, cycle.id, recruits[4]!.id, aiProgram, 'contact', offCampus(aiStaff[4]!.id))).toMatchObject({ ok: false, reason: 'OFF_CAMPUS_RECRUITER_DAILY_LIMIT' })
  })

  it('enrolls one signed NCAA Player and performs one idempotent roster arrival', () => {
    let world = updateGameWorld(createNewGame(), { currentDate: createGameDate(2026, 11, 11) })
    const season = Object.values(world.seasons).find((item) => world.ecosystems[world.competitions[item.competitionId]!.ecosystemId]!.kind === 'ncaaLike')!
    const competition = world.competitions[season.competitionId]!
    const ecosystemId = competition.ecosystemId
    const cycle = { id: 'same-id-ncaa-cycle', ecosystemId: ecosystemId as EcosystemId, sourceSeasonId: season.id, targetSeasonId: season.id, opensOn: world.currentDate, signingOn: world.currentDate, closesOn: season.endDate, status: 'open' as const, rules: { ...defaultRecruitingRules, poolSize: 1, commitmentThreshold: 1 }, calendar: recruitingRulesetForSeason('men', 2026) }
    world = updateGameWorld(world, { currentSeasonId: season.id, recruitingCycles: [...Object.values(world.recruitingCyclesById), cycle] })
    world = generateRecruitingPool(world, cycle.id)
    let recruit = Object.values(world.recruitProfilesById).find((item) => item.cycleId === cycle.id)!
    world = updateGameWorld(world, { recruitProfiles: Object.values(world.recruitProfilesById).map((profile) => profile.id === recruit.id ? { ...profile, education: { highSchoolGraduationYear: 2028 } } : profile) })
    recruit = world.recruitProfilesById[recruit.id]!
    const program = competition.participantTeamIds[0]!
    const offer = makeRecruitingOffer(world, cycle.id, recruit.id, program)
    if (!offer.ok) throw new Error(`offer failed: ${offer.reason}`)
    let committed = resolveRecruitingCommitments(offer.value, cycle.id)
    const signed = signCommittedRecruit(committed, cycle.id, recruit.id)
    if (!signed.ok) throw new Error('signing failed')
    const arrived = arriveSignedRecruits(signed.value)
    expect(arrived.teams[program]!.rosterPlayerIds.filter((id) => id === recruit.playerId)).toHaveLength(1)
    expect(Object.values(arrived.playerEnrollmentsById).filter((item) => item.playerId === recruit.playerId && item.status === 'active')).toHaveLength(1)
    expect(Object.values(arrived.collegeEligibilityAssessmentsById).find((item) => item.playerId === recruit.playerId)?.eligible).toBe(true)
    expect(arriveSignedRecruits(arrived).teams[program]!.rosterPlayerIds.filter((id) => id === recruit.playerId)).toHaveLength(1)
  })

  it('preserves formal signing while rolling back an ineligible BS15D arrival', () => {
    let world = createNewGame()
    const season = Object.values(world.seasons).find((item) => world.ecosystems[world.competitions[item.competitionId]!.ecosystemId]!.kind === 'ncaaLike')!
    const competition = world.competitions[season.competitionId]!
    const ecosystem = world.ecosystems[competition.ecosystemId]!
    const program = competition.participantTeamIds[0]!
    const year = Number(season.startDate.slice(0, 4))
    const wednesday = Array.from({ length: 14 }, (_, index) => index + 1).filter((day) => new Date(Date.UTC(year, 10, day)).getUTCDay() === 3)[1]!
    const signingDate = createGameDate(year, 11, wednesday)
    const cycle = { id: 'ineligible-arrival-cycle', ecosystemId: ecosystem.id, sourceSeasonId: season.id, targetSeasonId: season.id, opensOn: world.currentDate, signingOn: signingDate, closesOn: season.endDate, status: 'open' as const, rules: { ...defaultRecruitingRules, poolSize: 1, commitmentThreshold: -100 }, calendar: recruitingRulesetForSeason(ecosystem.category, year) }
    world = updateGameWorld(world, { currentDate: signingDate, currentSeasonId: season.id, recruitingCycles: [...Object.values(world.recruitingCyclesById), cycle] })
    world = generateRecruitingPool(world, cycle.id)
    const recruit = Object.values(world.recruitProfilesById).find((item) => item.cycleId === cycle.id)!
    const playerId = recruit.playerId
    const personId = world.players[playerId]!.personId!
    const offer = makeRecruitingOffer(world, cycle.id, recruit.id, program)
    expect(offer.ok).toBe(true)
    if (!offer.ok) throw new Error(`ineligible arrival offer failed: ${offer.reason}`)
    world = resolveRecruitingCommitments(offer.value, cycle.id)
    const signed = signCommittedRecruit(world, cycle.id, recruit.id)
    expect(signed.ok).toBe(true)
    if (!signed.ok) throw new Error(`ineligible arrival signing failed: ${signed.reason}`)
    world = updateGameWorld(signed.value, { currentDate: createGameDate(year + 1, 1, 15), academicProfiles: [...Object.values(signed.value.academicProfilesById), { id: `academic:${ecosystem.id}:${program}:${playerId}`, playerId, ecosystemId: ecosystem.id, programTeamId: program, performance: 0, progress: 0 }] })
    const arrived = arriveSignedRecruits(world)
    expect(arrived.recruitSigningsById[`signing:${cycle.id}:${recruit.id}`]?.playerId).toBe(playerId)
    expect(arrived.recruitProfilesById[recruit.id]!.status).toBe('ineligible')
    expect(arrived.recruitProfilesById[recruit.id]!.recruitingRpg!.story.at(-1)).toContain('eligibility assessment')
    expect(arrived.teams[program]!.rosterPlayerIds).not.toContain(playerId)
    expect(Object.values(arrived.playerEnrollmentsById).filter((item) => item.playerId === playerId && item.status === 'active')).toHaveLength(0)
    expect(Object.values(arrived.playerEnrollmentsById).filter((item) => item.playerId === playerId && item.status === 'ended')).toHaveLength(1)
    expect(arrived.players[playerId]!.personId).toBe(personId)
    expect(arrived.personsById[personId]).toBeDefined()
    expect(arriveSignedRecruits(arrived).teams[program]!.rosterPlayerIds).not.toContain(playerId)
  })

  it('keeps an unsigned verbal commitment vulnerable to a stronger later relationship', () => {
    let world = recruitingWorld()
    const recruit = Object.values(world.recruitProfilesById)[0]!
    const preference = Object.fromEntries(Object.keys(recruit.recruitingRpg!.preferenceProfile.importance).map((key) => [key, key === 'coachTrust' ? 10 : 1])) as NonNullable<typeof recruit.recruitingRpg>['preferenceProfile']['importance']
    const relationships = [
      { programTeamId: home, actor: 'headCoach' as const, actorId: String(world.teams[home]!.coachId), familiarity: 80, rapport: 80, trust: 95, credibility: 90, updatedOn: world.currentDate },
      { programTeamId: away, actor: 'headCoach' as const, actorId: String(world.teams[away]!.coachId), familiarity: 5, rapport: 5, trust: 5, credibility: 5, updatedOn: world.currentDate },
    ]
    world = updateGameWorld(world, { recruitProfiles: Object.values(world.recruitProfilesById).map((item) => item.id === recruit.id ? { ...item, recruitingRpg: { ...item.recruitingRpg!, preferenceProfile: { ...item.recruitingRpg!.preferenceProfile, importance: preference, decisionStyle: 'deliberate' }, relationships } } : item) })
    const firstOffer = makeRecruitingOffer(world, 'rpg-cycle', recruit.id, home)
    if (!firstOffer.ok) throw new Error('first offer failed')
    const committed = resolveRecruitingCommitments(firstOffer.value, 'rpg-cycle')
    expect(Object.values(committed.recruitingCommitmentsById)[0]?.programTeamId).toBe(home)
    world = updateGameWorld(committed, { recruitProfiles: Object.values(committed.recruitProfilesById).map((item) => item.id === recruit.id ? { ...item, recruitingRpg: { ...item.recruitingRpg!, relationships: relationships.map((relationship) => relationship.programTeamId === away ? { ...relationship, trust: 100, rapport: 100 } : { ...relationship, trust: 0, rapport: 0 }) } } : item), recruitingOffers: [...Object.values(committed.recruitingOffersById), { id: 'rival-offer', cycleId: 'rpg-cycle', recruitId: recruit.id, programTeamId: away, status: 'active', madeOn: world.currentDate }] })
    const flipped = resolveRecruitingCommitments(world, 'rpg-cycle')
    expect(Object.values(flipped.recruitingCommitmentsById)[0]?.programTeamId).toBe(away)
    expect(flipped.recruitSigningsById).toEqual({})
  })

  it('keeps terminal negotiation history and creates a fresh attempt after verbal decommitment', () => {
    let world = recruitingWorld()
    const recruit = Object.values(world.recruitProfilesById)[0]!
    const firstNegotiation = openRecruitingNegotiation(world, 'rpg-cycle', recruit.id, home)
    expect(firstNegotiation.ok).toBe(true)
    if (!firstNegotiation.ok) return
    const offer = makeRecruitingOffer(firstNegotiation.world, 'rpg-cycle', recruit.id, home)
    expect(offer.ok).toBe(true)
    if (!offer.ok) return
    world = resolveRecruitingCommitments(offer.value, 'rpg-cycle')
    expect(world.recruitProfilesById[recruit.id]!.recruitingRpg!.negotiations![0]!.terminalState).toBe('committed')
    const decommitted = decommitRecruitingProspect(world, 'rpg-cycle', recruit.id)
    expect(decommitted.ok).toBe(true)
    if (!decommitted.ok) return
    const reopened = openRecruitingNegotiation(decommitted.value, 'rpg-cycle', recruit.id, home)
    expect(reopened.ok).toBe(true)
    if (!reopened.ok) return
    expect(reopened.negotiation.id).not.toBe(firstNegotiation.negotiation.id)
    expect(reopened.negotiation.terminalState).toBe('active')
    expect(reopened.world.recruitProfilesById[recruit.id]!.recruitingRpg!.negotiations).toHaveLength(2)
  })
})
