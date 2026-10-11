import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { addDays, createGameDate } from '@/domain/date'
import { createCountry } from '@/domain/country'
import { createPlace } from '@/domain/facilities'
import { recordPlayerPathway, type Player } from '@/domain/player'
import { createTalentCohort } from '@/domain/talent'
import { createPlayerRegistration } from '@/domain/youth/ClubPathway'
import { recruitingRulesetForSeason } from '@/domain/recruiting'
import { createTalentSupplyCohort, materializeTalentCandidate, materializeTalentCandidates } from '@/engine/world/TalentSupply'
import { advanceDayWithTrace } from '@/engine/calendar/CalendarEngine'
import { updateGameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { addRecruitingBoardEntry, arriveSignedRecruits, generateRecruitingPool, makeRecruitingOffer, performRecruitingAction, rankAiRecruitingTargets, resolveRecruitingCommitments, signCommittedRecruit } from './RecruitingEngine'

describe('NCAA canonical talent intake bridge', () => {
  it('consumes context-generated HS, JUCO, international, academy, and fallback candidates unchanged', () => {
    let world = createNewGame({ seed: 15015 })
    const cycle = Object.values(world.recruitingCyclesById).find((item) => world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike' && world.ecosystems[item.ecosystemId]?.category === 'men')!
    const existingCohort = Object.values(world.talentCohortsById).find((item) => item.gender === 'male')!
    const internationalPlaceId = existingCohort.placeId
    world = updateGameWorld(world, { talentCohorts: [] })
    const usa = createCountry({ id: 'country:bridge-usa' as never, name: 'United States', code: 'USA' })
    const otherCountry = createCountry({ id: 'country:bridge-other' as never, name: 'Other source context', code: 'OTH' })
    const usaPlace = createPlace({ id: 'place:bridge-usa', kind: 'CITY', name: 'United States source place', countryId: usa.id })
    const otherPlace = createPlace({ id: 'place:bridge-other', kind: 'CITY', name: 'Other source place', countryId: otherCountry.id })
    world = updateGameWorld(world, { countries: [...Object.values(world.countries), usa, otherCountry], places: [...Object.values(world.placesById), usaPlace, otherPlace] })
    const addCohort = (id: string, placeId: string, birthYear: number, seed: number) => {
      const cohort = createTalentCohort({ id, placeId: placeId as never, birthYear, generationYear: 2032, gender: 'male', seed, inputVersion: 'source-emergence-smoke-v1', inputs: existingCohort.inputs })
      world = createTalentSupplyCohort(world, cohort)
      return cohort
    }
    const hs = addCohort('000-hs', usaPlace.id, 2014, 101)
    const juco = addCohort('001-juco', usaPlace.id, 2013, 812)
    const international = addCohort('002-international', internationalPlaceId, 2014, 813)
    const academy = addCohort('003-academy', usaPlace.id, 2014, 102)
    const other = addCohort('004-other', otherPlace.id, 2014, 103)
    const generated = new Map<string, Player>()
    const materializeUntil = (cohortId: string, cause: 'RECRUITING_POOL' | 'ACADEMY_INTAKE', wanted: string, limit = 15) => {
      for (let index = 1; index <= limit; index += 1) {
        const result = materializeTalentCandidate(world, cohortId, index, cause)
        world = result.world
        const source = result.player.pathwayHistory!.at(-1)!.source
        if (source === wanted) {
          generated.set(source, result.player)
          return
        }
      }
      throw new Error(`Could not generate ${wanted} from ${cohortId} within ${limit} candidates`)
    }
    materializeUntil(hs.id, 'RECRUITING_POOL', 'US_HIGH_SCHOOL', 1)
    materializeUntil(juco.id, 'RECRUITING_POOL', 'JUCO')
    materializeUntil(international.id, 'RECRUITING_POOL', 'INTERNATIONAL_CLUB')
    materializeUntil(academy.id, 'ACADEMY_INTAKE', 'ACADEMY_YOUTH', 1)
    materializeUntil(other.id, 'RECRUITING_POOL', 'OTHER_PRECOLLEGE', 1)
    const registeredResult = materializeTalentCandidate(world, other.id, 2, 'RECRUITING_POOL')
    world = registeredResult.world
    const registeredCandidate = registeredResult.player
    const withoutDuplicateSource = { ...registeredCandidate, pathwayHistory: undefined }
    const registeredCompetition = Object.values(world.competitions).find((competition) => competition.ecosystemId === cycle.ecosystemId)!
    const registeredTeam = world.teams[registeredCompetition.participantTeamIds[0]!]!
    const registration = createPlayerRegistration({ id: 'registration:source-emergence-authority', playerId: registeredCandidate.id, teamId: registeredTeam.id, organizationId: registeredTeam.organizationId, startsOn: world.currentDate, endsOn: world.currentDate, cause: 'ACADEMY_INTAKE', sourceActionId: 'source-emergence:academy-registration' })
    world = updateGameWorld(world, { players: [...Object.values(world.players).map((player) => player.id === withoutDuplicateSource.id ? withoutDuplicateSource : player)], playerRegistrations: [...Object.values(world.playerRegistrationsById), registration] })
    const before = new Map([...generated].map(([source, player]) => [source, player.pathwayHistory]))
    const pooled = generateRecruitingPool(world, cycle.id)
    for (const [source, player] of generated) {
      const profile = Object.values(pooled.recruitProfilesById).find((item) => item.playerId === player.id)
      expect(profile).toBeDefined()
      expect(pooled.players[player.id]!.pathwayHistory).toEqual(before.get(source))
      expect(pooled.players[player.id]!.pathwayHistory!.at(-1)!.source).toBe(source)
      expect(profile!.origin).toBe(source === 'INTERNATIONAL_CLUB' ? 'international' : source === 'ACADEMY_YOUTH' ? 'academy' : 'preCollege')
    }
    expect(new Set([...generated.values()].map((player) => player.id)).size).toBe(5)
    expect(new Set([...generated.values()].map((player) => pooled.players[player.id]!.personId)).size).toBe(5)
    const registrationProfile = Object.values(pooled.recruitProfilesById).find((profile) => profile.playerId === registeredCandidate.id)
    expect(registrationProfile?.origin).toBe('academy')
    expect(pooled.players[registeredCandidate.id]!.pathwayHistory).toBeUndefined()
  })

  it('builds a bounded production pool from canonical TalentCohort Players and preserves identity and provenance in Save V4', () => {
    const initial = createNewGame({ seed: 15015 })
    let smokeWorld = initial
    let cycle = Object.values(smokeWorld.recruitingCyclesById).find((item) => smokeWorld.ecosystems[item.ecosystemId]?.kind === 'ncaaLike' && smokeWorld.ecosystems[item.ecosystemId]?.category === 'men')!
    let calendarDaysAdvanced = 0
    while (cycle.status !== 'open' && calendarDaysAdvanced < 120) {
      const day = advanceDayWithTrace(smokeWorld)
      expect(day.status).toBe('COMPLETED')
      smokeWorld = day.world
      cycle = smokeWorld.recruitingCyclesById[cycle.id]!
      calendarDaysAdvanced += 1
    }
    expect(cycle.status).toBe('open')
    console.info('BS15I calendar smoke', { calendarDaysAdvanced, openedOn: cycle.opensOn, currentDate: smokeWorld.currentDate })
    const beforePlayerIds = new Set(Object.keys(initial.players))
    const pooled = generateRecruitingPool(smokeWorld, cycle.id)
    const profiles = Object.values(pooled.recruitProfilesById).filter((item) => item.cycleId === cycle.id)
    const materializations = Object.values(pooled.talentMaterializationsByCandidateKey)

    expect(profiles.length).toBeGreaterThan(0)
    expect(profiles.length).toBeLessThanOrEqual(cycle.rules.poolSize)
    expect(materializations.length).toBeGreaterThan(0)
    expect(materializations.length).toBeLessThanOrEqual(cycle.rules.poolSize)
    expect(Object.keys(pooled.players).filter((id) => !beforePlayerIds.has(id)).every((id) => id.startsWith('player:talent:'))).toBe(true)
    expect(Object.keys(pooled.players).some((id) => id.startsWith(`recruit:${cycle.id}:`))).toBe(false)
    expect(profiles.every((profile) => pooled.players[profile.playerId] !== undefined)).toBe(true)
    expect(new Set(materializations.map((item) => item.playerId)).size).toBe(materializations.length)
    expect(new Set(materializations.map((item) => pooled.players[item.playerId]!.personId)).size).toBe(materializations.length)
    const generatedSources = materializations.map((item) => pooled.players[item.playerId]!.pathwayHistory?.at(-1)?.source)
    expect(generatedSources.every((source) => source !== undefined)).toBe(true)
    expect(new Set(generatedSources).size).toBeGreaterThan(1)
    const sourceCounts = Object.fromEntries(['US_HIGH_SCHOOL', 'JUCO', 'INTERNATIONAL_CLUB', 'ACADEMY_YOUTH', 'OTHER_PRECOLLEGE'].map((source) => {
      const generated = generatedSources.filter((item) => item === source).length
      const recruitProfiles = profiles.filter((profile) => pooled.players[profile.playerId]!.pathwayHistory?.at(-1)?.source === source).length
      return [source, { generated, recruitable: recruitProfiles, recruitProfile: recruitProfiles }]
    }))
    console.info('BS15I NCAA source emergence smoke', sourceCounts)
    expect(new Set(profiles.map((profile) => profile.position))).toEqual(new Set(['PG', 'SG', 'SF', 'PF', 'C']))

    const firstPlayer = pooled.players[materializations[0]!.playerId]!
    const repeated = generateRecruitingPool(pooled, cycle.id)
    expect(repeated).toBe(pooled)
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(pooled, `${pooled.currentDate}T00:00:00.000Z`))))
    expect(restored.talentMaterializationsByCandidateKey[materializations[0]!.candidateKey]?.playerId).toBe(firstPlayer.id)
    expect(restored.players[firstPlayer.id]!.personId).toBe(firstPlayer.personId)
    expect(restored.players[firstPlayer.id]!.pathwayHistory).toEqual(firstPlayer.pathwayHistory)
    expect(restored.recruitProfilesById[profiles[0]!.id]).toEqual(profiles[0])
  }, 60_000)

  it('keeps the four required route labels explicit and ordered on a single canonical Player', () => {
    let world = createNewGame({ seed: 15015 })
    const sources = ['US_HIGH_SCHOOL', 'JUCO', 'INTERNATIONAL_CLUB', 'ACADEMY_YOUTH'] as const
    const cycle = Object.values(world.recruitingCyclesById).find((item) => world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike' && world.ecosystems[item.ecosystemId]?.category === 'men')!
    const originCohort = Object.values(world.talentCohortsById).find((item) => item.gender === 'male')!
    const cohort = createTalentCohort({ id: 'bridge-route-age-eligible', placeId: originCohort.placeId, birthYear: 2009, generationYear: 2032, gender: 'male', seed: 812, inputVersion: 'bridge-route-v1', inputs: originCohort.inputs })
    world = createTalentSupplyCohort(world, cohort)
    const materialized = materializeTalentCandidates(world, sources.map((source, index) => ({ cohortId: cohort.id, candidateIndex: index + 1, cause: 'RECRUITING_POOL' as const, pathwaySource: source })))
    const sourcePlayers = materialized.players.map((player, index) => recordPlayerPathway(player, { id: `route-history:${sources[index]}`, source: sources[index]!, occurredOn: world.currentDate, evidenceId: `route-evidence:${sources[index]}` }))
    world = updateGameWorld(materialized.world, { players: Object.values(materialized.world.players).map((item) => sourcePlayers.find((candidate) => candidate.id === item.id) ?? item) })
    world = updateGameWorld(world, { recruitingCycles: Object.values(world.recruitingCyclesById).map((item) => item.id === cycle.id ? { ...item, status: 'open' as const } : item) })
    const pooled = generateRecruitingPool(world, cycle.id)
    const routeProfiles = sourcePlayers.map((player) => Object.values(pooled.recruitProfilesById).find((profile) => profile.playerId === player.id)!)
    expect(routeProfiles.every((profile) => profile !== undefined)).toBe(true)
    expect(routeProfiles.map((profile) => profile.origin)).toEqual(['preCollege', 'preCollege', 'international', 'academy'])
    const program = Object.values(pooled.competitions).find((competition) => competition.ecosystemId === cycle.ecosystemId)!.participantTeamIds[0]!
    for (const profile of routeProfiles) {
      expect(rankAiRecruitingTargets(pooled, cycle.id, program).some((item) => item.id === profile.id)).toBe(true)
      const board = addRecruitingBoardEntry(pooled, { programTeamId: program, recruitId: profile.id, priority: 'normal' })
      const action = performRecruitingAction(board, cycle.id, profile.id, program, 'contact')
      expect(action.ok, action.ok ? undefined : action.reason).toBe(true)
    }
    let routed = pooled
    for (const profile of routeProfiles) {
      const offer = makeRecruitingOffer(routed, cycle.id, profile.id, program)
      expect(offer.ok, offer.ok ? undefined : offer.reason).toBe(true)
      if (!offer.ok) throw new Error(offer.reason)
      routed = offer.value
    }
    routed = updateGameWorld(routed, { recruitingCycles: Object.values(routed.recruitingCyclesById).map((item) => item.id === cycle.id ? { ...item, rules: { ...item.rules, commitmentThreshold: -100, maxSignings: Math.max(item.rules.maxSignings, routeProfiles.length) } } : item) })
    routed = resolveRecruitingCommitments(routed, cycle.id)
    const season = Object.values(routed.seasons).find((item) => routed.competitions[item.competitionId]?.ecosystemId === cycle.ecosystemId)!
    const signingYear = Math.max(Number(season.startDate.slice(0, 4)), Number(routed.currentDate.slice(0, 4)))
    const signingDay = (year: number) => {
      const Wednesdays = Array.from({ length: 14 }, (_, index) => index + 1).filter((day) => new Date(Date.UTC(year, 10, day)).getUTCDay() === 3)
      return createGameDate(year, 11, Wednesdays[1]!)
    }
    const signOn = signingDay(signingYear)
    routed = updateGameWorld(routed, { currentDate: signOn, recruitingCycles: Object.values(routed.recruitingCyclesById).map((item) => item.id === cycle.id ? { ...item, targetSeasonId: season.id, status: 'open' as const, calendar: recruitingRulesetForSeason('men', signingYear), institutionalSigningPolicies: [{ programTeamId: program, seasonId: item.sourceSeasonId, finalAidSigningDate: addDays(signOn, 280), provenance: 'SIMULATED_CARRY_FORWARD' as const, basedOnSeasonId: item.sourceSeasonId }] } : item) })
    for (const profile of routeProfiles) {
      const signed = signCommittedRecruit(routed, cycle.id, profile.id)
      expect(signed.ok, signed.ok ? undefined : signed.reason).toBe(true)
      if (!signed.ok) throw new Error(signed.reason)
      routed = signed.value
    }
    const arrivalDate = season.startDate > signOn ? season.startDate : signOn
    expect(arrivalDate <= season.endDate).toBe(true)
    if (arrivalDate <= season.endDate) {
      routed = arriveSignedRecruits(updateGameWorld(routed, { currentDate: arrivalDate, currentSeasonId: season.id }))
      for (const profile of routeProfiles) {
        expect(routed.recruitProfilesById[profile.id]!.status).toBe('arrived')
        expect(routed.teams[program]!.rosterPlayerIds).toContain(profile.playerId)
        expect(Object.values(routed.playerEnrollmentsById).some((enrollment) => enrollment.playerId === profile.playerId && enrollment.status === 'active')).toBe(true)
        expect(Object.values(routed.collegeEligibilityAssessmentsById).some((assessment) => assessment.playerId === profile.playerId && assessment.eligible)).toBe(true)
      }
    }
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(routed, `${routed.currentDate}T00:00:00.000Z`))))
    for (const [index, player] of sourcePlayers.entries()) {
      expect(restored.players[player.id]!.pathwayHistory?.some((item) => item.source === sources[index])).toBe(true)
      expect(restored.players[player.id]!.id).toBe(player.id)
      expect(restored.players[player.id]!.personId).toBe(player.personId)
      expect(Object.values(restored.recruitProfilesById).find((profile) => profile.playerId === player.id)?.status).toBe('arrived')
      expect(Object.values(restored.recruitSigningsById).some((signing) => signing.playerId === player.id)).toBe(true)
      expect(Object.values(restored.playerEnrollmentsById).some((enrollment) => enrollment.playerId === player.id && enrollment.status === 'active')).toBe(true)
      expect(Object.values(restored.collegeEligibilityAssessmentsById).some((assessment) => assessment.playerId === player.id && assessment.eligible)).toBe(true)
    }
  })
})
