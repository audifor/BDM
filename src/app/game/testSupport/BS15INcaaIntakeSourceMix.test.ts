import { expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { addDays, parseGameDate } from '@/domain/date'
import { calculateAge } from '@/domain/player'
import { createNewGame } from '@/app/game'
import { playerIdFromString, teamIdFromString } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getEligiblePlayersForCompetition } from '@/engine/eligibility'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { runTalentLongHorizonCertification } from './TalentLongHorizonCertification'

type Source = 'HS'|'JUCO'|'INTERNATIONAL'|'ACADEMY_YOUTH'|'TALENT_COHORT_OTHER'|'PORTAL'|'LEGACY_SYNTHETIC'|'UNKNOWN_PROVENANCE'
type IntakeEvent = { date: string; gender: string; teamId: string; source: Source; materializationSource?: string; playerId: string; personId?: string; profileId?: string; enrollmentId?: string; signingId?: string; portalEntryId?: string; materializationCandidateKey?: string; qualityMean?: number; position?: string; age?: number; countryId?: string; eligibility: boolean; ineligibleReasons: readonly string[] }
const sources: readonly Source[] = ['HS','JUCO','INTERNATIONAL','ACADEMY_YOUTH','TALENT_COHORT_OTHER','PORTAL','LEGACY_SYNTHETIC','UNKNOWN_PROVENANCE']

function primarySource(world: GameWorld, input: { playerId: string; teamId: string; profileId?: string; portal: boolean; occurredOn: string }): { source: Source; materializationSource?: string; candidateKey?: string } {
  const { playerId, teamId, profileId, portal, occurredOn } = input
  if (portal) return { source: 'PORTAL' }
  const pathway = world.players[playerId as keyof typeof world.players]?.pathwayHistory?.filter((item) => item.occurredOn <= occurredOn).at(-1)
  if (pathway !== undefined) {
    const source = pathway.source === 'US_HIGH_SCHOOL' ? 'HS' : pathway.source === 'JUCO' ? 'JUCO' : pathway.source === 'INTERNATIONAL_CLUB' ? 'INTERNATIONAL' : pathway.source === 'ACADEMY_YOUTH' ? 'ACADEMY_YOUTH' : 'TALENT_COHORT_OTHER'
    const materialization = Object.values(world.talentMaterializationsByCandidateKey).find(item => item.playerId === playerId && item.materializedOn <= occurredOn)
    return { source, ...(materialization === undefined ? {} : { materializationSource: materialization.materializationCause, candidateKey: materialization.candidateKey }) }
  }
  const registrations = Object.values(world.playerRegistrationsById).filter(item => item.playerId === playerId && item.startsOn <= occurredOn)
  if (registrations.some(item => item.cause === 'ACADEMY_INTAKE' || item.cause === 'AGE_GROUP_PROMOTION' || item.cause === 'RESERVE_PROMOTION' || item.cause === 'SENIOR_PROMOTION')) return { source: 'ACADEMY_YOUTH' }
  const profile = profileId ? world.recruitProfilesById[profileId] : undefined
  const fibaHistory = Object.values(world.ecosystemTransitionsById).some(transition => transition.playerId === playerId && transition.effectiveDate <= occurredOn && world.ecosystems[transition.fromEcosystemId]?.kind === 'fibaLike')
  if (fibaHistory) return { source: 'INTERNATIONAL' }
  const materialization = Object.values(world.talentMaterializationsByCandidateKey).find(item => item.playerId === playerId && item.materializedOn <= occurredOn)
  if (materialization !== undefined) return { source: 'TALENT_COHORT_OTHER', materializationSource: materialization.materializationCause, candidateKey: materialization.candidateKey }
  // The exact paired IDs are emitted by RecruitingEngine.generateRecruitingPool,
  // which directly creates the Player and RecruitProfile with no prior pathway.
  const cycle = profile && world.recruitingCyclesById[profile.cycleId]
  if (profile && cycle && profile.id.startsWith(`recruit-profile:${cycle.id}:`) && playerId === `recruit:${cycle.id}:${profile.id.slice(`recruit-profile:${cycle.id}:`.length)}`) return { source: 'LEGACY_SYNTHETIC' }
  return { source: 'UNKNOWN_PROVENANCE' }
}

function quality(player: GameWorld['players'][keyof GameWorld['players']]): number {
  const values = Object.values(player.basketball.ratings)
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
}

function materializationFor(world: GameWorld, playerId: string, occurredOn: string) {
  return Object.values(world.talentMaterializationsByCandidateKey).find(item => item.playerId === playerId && item.materializedOn <= occurredOn)
}

function percentiles(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const q = (p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]! : undefined
  return { n: sorted.length, p10: q(0.10), p50: q(0.50), p90: q(0.90), p99: sorted.length >= 100 ? q(0.99) : undefined }
}

it('measures provenance-backed NCAA roster intake across two complete seasons', async () => {
  if (process.env.BS15I_NCAA_INTAKE_CERTIFY !== '1') return
  const fresh = createNewGame({ seed: 15015 })
  const userCoachId = Object.keys(fresh.coachEmploymentByCoachId).find(id => fresh.coachEmploymentByCoachId[id as keyof typeof fresh.coachEmploymentByCoachId]?.status === 'unemployed') as GameWorld['userCoachId']
  const initial = updateGameWorld(fresh, { userCoachId })
  const ecosystems = Object.values(initial.ecosystems).filter(item => item.kind === 'ncaaLike')
  const competitions = Object.values(initial.competitions).filter(item => ecosystems.some(ecosystem => ecosystem.id === item.ecosystemId))
  const teams = [...new Set(competitions.flatMap(item => item.participantTeamIds))].sort()
  const teamGender = Object.fromEntries(teams.map(teamId => [teamId, initial.teams[teamIdFromString(teamId)]!.gender])) as Record<string, string>
  const fixtureSize = {
    ncaaEcosystems: ecosystems.map(item => ({ id: item.id, category: item.category })),
    competitions: competitions.map(item => ({ id: item.id, ecosystemId: item.ecosystemId, participantTeams: item.participantTeamIds.length })),
    activeCompetitionCount: competitions.length,
    uniqueTeams: teams.length,
    menTeams: teams.filter(id => teamGender[id] === 'male').length,
    womenTeams: teams.filter(id => teamGender[id] === 'female').length,
  }
  expect(userCoachId).toBeDefined()
  expect(fixtureSize.menTeams + fixtureSize.womenTeams).toBe(fixtureSize.uniqueTeams)
  const starts = new Map(teams.map(teamId => [teamId, [...initial.teams[teamIdFromString(teamId)]!.rosterPlayerIds]]))
  const periodStart = initial.currentDate
  const boundaries = ['2033-12-31','2034-12-31'] as const
  const firstSeasonRosters = new Map<string, readonly string[]>()
  const eventsBySeason: Record<string, IntakeEvent[]> = Object.fromEntries(boundaries.map(date => [date, []]))
  const initialMaterials = new Set(Object.keys(initial.talentMaterializationsByCandidateKey))
  const results: Record<string, unknown> = {}
  const outputPrefix = 'C:/Temp/BS15I-ncaa-intake-source-mix'
  let seasonIndex = 0

  const run = await runTalentLongHorizonCertification({
    world: initial,
    targetDate: parseGameDate(boundaries[1]),
    seed: 15015,
    checkpointDates: boundaries.map(parseGameDate),
    saveReloadDates: boundaries.map(parseGameDate),
    deepIntegrityDates: boundaries.map(parseGameDate),
    maximumRuntimeMs: 60 * 60 * 1000,
    onDayAdvance: day => {
      if (day.world.currentDate === '2033-12-29') for (const teamId of teams) firstSeasonRosters.set(teamId, [...day.world.teams[teamIdFromString(teamId)]!.rosterPlayerIds])
      if (day.world.currentDate.endsWith('-01')) process.stdout.write(`[NCAA intake progress] ${day.world.currentDate}\n`)
    },
    onProgress: (checkpoint, world) => {
      const date = checkpoint.date
      const seasonTeams = new Set(competitions.flatMap(competition => competition.participantTeamIds))
      const openingRosters = date === boundaries[0] ? starts : firstSeasonRosters
      const portalRows = Object.values(world.transferPortalEntriesById).filter(entry => entry.movement && entry.movement.transferredOn > (seasonIndex === 0 ? periodStart : boundaries[0]) && entry.movement.transferredOn <= date)
      const portalPlayerIds = new Set(portalRows.map(entry => entry.playerId))
      const arrivals: IntakeEvent[] = []
      for (const signing of Object.values(world.recruitSigningsById)) {
        const profile = world.recruitProfilesById[signing.recruitId]
        const enrollment = Object.values(world.playerEnrollmentsById).find(item => item.playerId === signing.playerId && item.teamId === signing.programTeamId && item.startsOn > (seasonIndex === 0 ? periodStart : boundaries[0]) && item.startsOn <= date)
        if (!enrollment || !seasonTeams.has(signing.programTeamId) || (openingRosters.get(signing.programTeamId) ?? []).includes(signing.playerId)) continue
        if (profile?.status !== 'arrived' || profile.origin === 'transfer') continue
        const eventSource = primarySource(world, { playerId: signing.playerId, teamId: signing.programTeamId, profileId: profile.id, portal: portalPlayerIds.has(signing.playerId), occurredOn: enrollment.startsOn })
        const player = world.players[signing.playerId]!
        const materialization = materializationFor(world, signing.playerId, enrollment.startsOn)
        const assessment = Object.values(world.collegeEligibilityAssessmentsById).filter(item => item.playerId === player.id && item.teamId === signing.programTeamId && item.assessedOn <= date).sort((a, b) => b.assessedOn.localeCompare(a.assessedOn))[0]
        arrivals.push({ date: enrollment.startsOn, gender: world.teams[signing.programTeamId]!.gender, teamId: signing.programTeamId, source: eventSource.source, ...(materialization ? { materializationSource: materialization.materializationCause, materializationCandidateKey: materialization.candidateKey } : {}), playerId: player.id, personId: player.personId, profileId: profile.id, enrollmentId: enrollment.id, signingId: signing.id, qualityMean: quality(player), position: player.basketball.primaryPosition, age: calculateAge(player.bio.dateOfBirth, enrollment.startsOn), ...(materialization && world.placesById[materialization.placeId]?.countryId ? { countryId: world.placesById[materialization.placeId]!.countryId! } : {}), eligibility: assessment?.eligible ?? false, ineligibleReasons: assessment?.reasons.filter(reason => reason !== 'ELIGIBLE') ?? ['ASSESSMENT_NOT_RECORDED'] })
      }
      for (const entry of portalRows) {
        const movement = entry.movement!
        const enrollment = world.playerEnrollmentsById[movement.destinationEnrollmentId]
        if (!enrollment || !seasonTeams.has(enrollment.teamId)) continue
        const originalRoster = openingRosters.get(enrollment.teamId) ?? []
        if (originalRoster.includes(entry.playerId)) continue
        const player = world.players[entry.playerId]!
        const assessment = Object.values(world.collegeEligibilityAssessmentsById).filter(item => item.playerId === player.id && item.teamId === enrollment.teamId && item.assessedOn <= date).sort((a, b) => b.assessedOn.localeCompare(a.assessedOn))[0]
        arrivals.push({ date: movement.transferredOn, gender: world.teams[enrollment.teamId]!.gender, teamId: enrollment.teamId, source: 'PORTAL', playerId: player.id, personId: player.personId, profileId: Object.values(world.recruitProfilesById).find(item => item.transferPortalEntryId === entry.id)?.id, enrollmentId: enrollment.id, portalEntryId: entry.id, qualityMean: quality(player), position: player.basketball.primaryPosition, age: calculateAge(player.bio.dateOfBirth, movement.transferredOn), eligibility: assessment?.eligible ?? false, ineligibleReasons: assessment?.reasons.filter(reason => reason !== 'ELIGIBLE') ?? ['ASSESSMENT_NOT_RECORDED'] })
      }
      const uniqueArrivals = [...new Map(arrivals.map(item => [`${item.teamId}:${item.playerId}`, item])).values()]
      eventsBySeason[date]!.push(...uniqueArrivals)
      const ncaa = competitions.flatMap(competition => competition.participantTeamIds.map(teamId => {
        const competitionId = competition.id
        const assessmentSeason = Object.values(world.seasons).filter(item => item.competitionId === competitionId && item.startDate <= date).sort((a, b) => b.startDate.localeCompare(a.startDate))[0]!
        const eligible = getEligiblePlayersForCompetition(world, teamId as never, competitionId as never, assessmentSeason.id, date)
        const beginRoster = openingRosters.get(teamId) ?? []
        const endRoster = world.teams[teamId]!.rosterPlayerIds
        const rosterAdds = uniqueArrivals.filter(item => item.teamId === teamId)
        const incomingSignings = Object.values(world.recruitSigningsById).filter(signing => signing.programTeamId === teamId && world.recruitProfilesById[signing.recruitId]?.status !== 'unsigned' && signing.signedOn > (seasonIndex === 0 ? periodStart : boundaries[0]) && signing.signedOn <= date)
        const outgoingPortal = portalRows.filter(entry => entry.sourceTeamId === teamId).length
        const outgoingPro = Object.values(world.ecosystemTransitionsById).filter(transition => transition.fromTeamId === teamId && transition.effectiveDate > (seasonIndex === 0 ? periodStart : boundaries[0]) && transition.effectiveDate <= date).length
        const endingDepartures = Object.values(world.playerEnrollmentsById).filter(item => item.teamId === teamId && item.status === 'ended' && item.endsOn && item.endsOn > (seasonIndex === 0 ? periodStart : boundaries[0]) && item.endsOn <= date).length
        return { teamId, gender: world.teams[teamId]!.gender, startingRoster: beginRoster.length, expectedDepartures: { portal: outgoingPortal, professional: outgoingPro, enrollmentEnded: endingDepartures }, signedRecruits: incomingSignings.length, effectiveArrivals: rosterAdds.filter(item => item.source !== 'PORTAL').length, portalArrivals: rosterAdds.filter(item => item.source === 'PORTAL').length, endingRoster: endRoster.length, eligibleRoster: eligible.length, unmetNeed: Math.max(0, 5 - eligible.length), arrivals: rosterAdds }
      }))
      const previousDate = seasonIndex === 0 ? periodStart : boundaries[0]
      // An intake cycle is indexed by the season in which its signed class can arrive.
      const cycles = Object.values(world.recruitingCyclesById).filter(cycle => {
        const arrivalDate = world.seasons[cycle.targetSeasonId]?.startDate
        return ecosystems.some(ecosystem => ecosystem.id === cycle.ecosystemId) && arrivalDate !== undefined && arrivalDate > previousDate && arrivalDate <= date
      })
      const candidates = Object.values(world.recruitProfilesById).filter(profile => cycles.some(cycle => cycle.id === profile.cycleId))
      const legacyByProfile = candidates.filter(profile => primarySource(world, { playerId: profile.playerId, teamId: Object.values(world.teams).find(team => team.rosterPlayerIds.includes(profile.playerId))?.id ?? teams[0]!, profileId: profile.id, portal: false, occurredOn: profile.recruitingRpg?.story[0]?.slice(0, 10) ?? date }).source === 'LEGACY_SYNTHETIC')
      const cohortRecords = Object.values(world.talentMaterializationsByCandidateKey).filter(item => !initialMaterials.has(item.candidateKey) && item.materializedOn > previousDate && item.materializedOn <= date)
      const arrivalsBySource = Object.fromEntries(sources.map(source => [source, uniqueArrivals.filter(item => item.source === source).length])) as Record<Source, number>
      const profilesBySource = Object.fromEntries(sources.map(source => [source, candidates.filter(profile => {
        const targetTeamId = teams.find(teamId => Object.values(world.competitions).some(competition => competition.participantTeamIds.includes(teamId) && ecosystems.some(ecosystem => ecosystem.id === competition.ecosystemId)))!
        return primarySource(world, { playerId: profile.playerId, teamId: targetTeamId, profileId: profile.id, portal: profile.origin === 'transfer', occurredOn: date }).source === source
      })])) as Record<Source, typeof candidates>
      const signedBySource = Object.fromEntries(sources.map(source => [source, Object.values(world.recruitSigningsById).filter(signing => {
        if (signing.signedOn <= previousDate || signing.signedOn > date) return false
        const profile = world.recruitProfilesById[signing.recruitId]
        return profile !== undefined && primarySource(world, { playerId: profile.playerId, teamId: signing.programTeamId, profileId: profile.id, portal: false, occurredOn: signing.signedOn }).source === source
      }).length])) as Record<Source, number>
      const sourceMix = {} as Record<Source, { available: number; materialized: number; signed: number; arrived: number; percentArrivals: number; candidates: number }>
      for (const source of sources) {
        const sourceArrivals = arrivalsBySource[source]
        const sourceCandidates = profilesBySource[source]
        sourceMix[source] = {
          available: source === 'TALENT_COHORT_OTHER' ? Object.values(world.talentCohortsById).reduce((sum, cohort) => sum + cohort.candidateCapacity, 0) : source === 'LEGACY_SYNTHETIC' ? legacyByProfile.length : sourceCandidates.length,
          materialized: source === 'TALENT_COHORT_OTHER' ? cohortRecords.length : source === 'LEGACY_SYNTHETIC' ? legacyByProfile.length : sourceCandidates.filter(profile => Object.values(world.talentMaterializationsByCandidateKey).some(item => item.playerId === profile.playerId)).length,
          signed: signedBySource[source], arrived: sourceArrivals,
          percentArrivals: uniqueArrivals.length ? sourceArrivals * 100 / uniqueArrivals.length : 0,
          candidates: sourceCandidates.length,
        }
      }
      const playerIds = new Set(Object.values(world.players).map(player => player.id))
      const materializedIds = Object.values(world.talentMaterializationsByCandidateKey).map(item => item.playerId)
      expect(new Set(materializedIds).size).toBe(materializedIds.length)
      expect(world.personsById).toBeDefined()
      const envelope = serializeGameWorldV4(world, `${date}T00:00:00.000Z`)
      const reloaded = deserializeGameWorldV4(JSON.parse(JSON.stringify(envelope)))
      for (const event of uniqueArrivals) {
        expect(reloaded.players[playerIdFromString(event.playerId)]?.personId).toBe(event.personId)
        expect(reloaded.teams[teamIdFromString(event.teamId)]?.rosterPlayerIds).toContain(event.playerId)
        expect(reloaded.playerEnrollmentsById[event.enrollmentId!]?.playerId).toBe(event.playerId)
        if (event.materializationCandidateKey) expect(reloaded.talentMaterializationsByCandidateKey[event.materializationCandidateKey]?.playerId).toBe(event.playerId)
        if (event.portalEntryId) expect(reloaded.transferPortalEntriesById[event.portalEntryId]?.movement?.playerId).toBe(event.playerId)
      }
      const teamEligible = ncaa.map(item => item.eligibleRoster).sort((a, b) => a - b)
      const aggregate = { date, cycles: cycles.map(item => item.id), teams: ncaa, sourceMix, arrivalsByGender: { men: uniqueArrivals.filter(item => item.gender === 'male').length, women: uniqueArrivals.filter(item => item.gender === 'female').length }, viability: { min: teamEligible[0], median: teamEligible[Math.floor(teamEligible.length / 2)], max: teamEligible.at(-1), belowPlayableMinimum: ncaa.filter(item => item.eligibleRoster < 5).length }, events: uniqueArrivals, talentCohort: { latentCandidateCapacity: Object.values(world.talentCohortsById).reduce((sum, cohort) => sum + cohort.candidateCapacity, 0), materializedInPeriod: cohortRecords.length, recruitedInPeriod: candidates.filter(profile => Object.values(world.talentMaterializationsByCandidateKey).some(item => item.playerId === profile.playerId)).length, arrivedInPeriod: uniqueArrivals.filter(item => item.materializationCandidateKey !== undefined).length, sample: cohortRecords.slice(0, 10).map(item => ({ candidateKey: item.candidateKey, playerId: item.playerId, personId: world.players[item.playerId]?.personId, cause: item.materializationCause })) }, portal: { entries: portalRows.length, authorized: portalRows.filter(item => item.processedOn !== undefined).length, recruited: Object.values(world.recruitProfilesById).filter(profile => profile.origin === 'transfer' && cycles.some(cycle => cycle.id === profile.cycleId)).length, committed: Object.values(world.recruitingCommitmentsById).filter(item => cycles.some(cycle => cycle.id === item.cycleId) && world.recruitProfilesById[item.recruitId]?.origin === 'transfer').length, completed: portalRows.length }, legacySynthetic: { created: legacyByProfile.length, signed: Object.values(world.recruitSigningsById).filter(signing => legacyByProfile.some(profile => profile.playerId === signing.playerId)).length, arrived: uniqueArrivals.filter(item => item.source === 'LEGACY_SYNTHETIC').length }, academic: { signed: Object.values(world.recruitSigningsById).filter(signing => signing.signedOn > previousDate && signing.signedOn <= date).length, arrived: uniqueArrivals.length, academicallyEligible: uniqueArrivals.filter(item => item.eligibility).length, academicallyIneligible: uniqueArrivals.filter(item => !item.eligibility).length, rejectionReasons: Object.entries(uniqueArrivals.flatMap(item => item.ineligibleReasons).reduce<Record<string, number>>((count, reason) => { count[reason] = (count[reason] ?? 0) + 1; return count }, {})) }, distributions: { qualityMean: percentiles(uniqueArrivals.flatMap(item => item.qualityMean === undefined ? [] : [item.qualityMean])), age: percentiles(uniqueArrivals.flatMap(item => item.age === undefined ? [] : [item.age])), positions: Object.fromEntries(['PG','SG','SF','PF','C'].map(position => [position, uniqueArrivals.filter(item => item.position === position).length])), countries: Object.fromEntries([...new Set(uniqueArrivals.map(item => item.countryId).filter(Boolean))].map(country => [country, uniqueArrivals.filter(item => item.countryId === country).length])) }, netPopulationChange: { startingPlayers: ncaa.reduce((sum, item) => sum + item.startingRoster, 0), primaryArrivals: uniqueArrivals.filter(item => item.source !== 'PORTAL').length, portalArrivals: uniqueArrivals.filter(item => item.source === 'PORTAL').length, departures: ncaa.reduce((sum, item) => sum + item.expectedDepartures.portal + item.expectedDepartures.professional, 0), endingPlayers: ncaa.reduce((sum, item) => sum + item.endingRoster, 0) }, saveReload: 'PASS', materializationPlayerIdsUnique: playerIds.size >= materializedIds.length }
      results[date] = { ...checkpoint, ...aggregate }
      writeFileSync(`${outputPrefix}-${date}.json`, JSON.stringify(results[date], null, 2))
      writeFileSync(`${outputPrefix}-combined.json`, JSON.stringify({ fixtureSize, periodStart, checkpoints: results }, null, 2))
      process.stdout.write(`[NCAA intake checkpoint] ${JSON.stringify({ date, activeCompetitions: fixtureSize.activeCompetitionCount, menTeams: fixtureSize.menTeams, womenTeams: fixtureSize.womenTeams, cycles: cycles.length, intake: uniqueArrivals.length, sources: arrivalsBySource, belowMinimum: ncaa.filter(item => item.eligibleRoster < 5).length, elapsedMs: checkpoint.elapsedMs })}\n`)
      seasonIndex += 1
    },
  })
  expect(run.stopReason).toBeUndefined(); expect(run.timedOutAt).toBeUndefined()
  expect(run.world.currentDate).toBe(boundaries[1])
  expect(Object.keys(results)).toEqual([...boundaries])
  expect(seasonIndex).toBe(2)
  writeFileSync(`${outputPrefix}-combined.json`, JSON.stringify({ fixtureSize, periodStart, checkpoints: results, totalRuntimeMs: run.elapsedMs }, null, 2))
  process.stdout.write(`[NCAA intake audit complete] ${JSON.stringify({ fixtureSize, checkpoints: boundaries, totalRuntimeMs: run.elapsedMs, sourceMix: Object.fromEntries(boundaries.map(date => [date, (results[date] as { sourceMix: unknown }).sourceMix])) })}\n`)
}, 65 * 60 * 1000)
