import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { createGameWorld, updateGameWorld, withSingleWorldValidation, type GameWorld } from '@/domain/world'
import * as CalendarEngine from '@/engine/calendar'
import * as PlayerDevelopmentEngine from '@/engine/development'
import { addDays, parseGameDate } from '@/domain/date'
import { createGame } from '@/domain/game'
import { PLAYER_TRUTH_RATING_KEYS, PLAYER_TRUTH_TENDENCY_KEYS } from '@/domain/player/PlayerTruthCatalog'
import type { WorldDbSelectionCatalogV1 } from '@/domain/worldDb/SelectionCatalog'
import type { WorldDbGameBootstrapSelectionV1, WorldDbGameBootstrapSliceV1 } from '@/domain/worldDb/GameBootstrap'
import type { WorldDbDatabaseInfoV1 } from '@/domain/worldDb/DatabaseInfo'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'
import { parseWorldCompetitionFormatDocument, type WorldCompetitionRuntimeBundle } from '@/domain/competition'
import { bootstrapGameWorldFromWorldDb } from './WorldDbGameBootstrap'
import { appointCreatedUserCoachToWorldDbClub } from './WorldDbUserCoachAppointment'
import { decideFirstStaffMeeting, firstStaffMeetingInboxId, getPendingFirstStaffMeeting, queueFirstStaffMeeting } from '@/app/coachLife/StaffTrustMeeting'
import { getRelationshipDimensions, relationshipKey } from '@/domain/relationships'
import { WorldDbSessionV1 } from './WorldDbSession'
import { advanceGameDay, type WorldDayAdvanceResult } from './advanceGameDay'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { getEligibleResponsibilityCandidates } from '@/ui/staffPresentation'
import { setTeamResponsibility } from '@/app/staffResponsibilities'
import { resolveDelegatedResponsibility } from '@/engine/staff/resolveDelegatedResponsibility'
import { applyMatchResult } from '@/engine/match'
import { getCompetitionPostseasonState, materializeCompetitionPostseason } from '@/engine/competition'
import { calculateStandings } from '@/engine/competition/standings'
import { finalizeCompletedSeason, isSeasonComplete } from '@/engine/season'
import { SPAIN_ACB_2025_26_CALENDAR } from '@/data/worldCompetitionCalendars'
import { spainCopaCompetitionSeasonId } from '@/data/worldCompetitionCalendars'
import { createWorldDbSpainGame } from './WorldDbSpainGame'
import { createConfiguredGameAsync } from './createConfiguredGame'
import { startNextSeason, startNextSeasonFor } from './startNextSeason'
import * as SeasonLifecycle from './startNextSeason'
import { simulateUntilDate, type SimulateUntilResult } from './simulateUntilDate'
import { continueGame, getExplicitAdvanceStopReason } from './ContinueFlow'
import { createLongitudinalEvidence, fingerprint, classifyContinueEvidence } from './WorldDbCertificationDiagnostics'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { reviewReturnToPlay } from '@/engine/injury/ReturnToPlayEngine'
import { createInlineMatchRunner } from '@/app/matchNext/MatchSimulationRunner'
import { advanceGameDayWithResult, advanceGameDayWithResultAsync } from './advanceGameDay'
import { createPlace, createFacility, createFacilityComponent, createFacilityComponentConditionRecord, createFacilityUsageRight } from '@/domain/facilities'
import { createTalentCohort } from '@/domain/talent'
import { materializeTalentCandidate } from '@/engine/world/TalentSupply'
import { createScheduledTrainingSession } from '@/domain/training'
import { executeScheduledTrainingSessions, scheduleTrainingSessionsBatch } from '@/engine/training/ScheduledTrainingEngine'
import { processCoachFinancesForMonth } from '@/engine/coachFinances'
import { evaluateSimulationBreakpoints } from './SimulationBreakpoints'
import { createPreMatchMediaOpportunity, skipMediaOpportunity } from '@/engine/media'

const source = { databaseId: 'real-world.db', schemaId: 'DDL-PHASE1-A' } as const
const runtimeBundle: WorldCompetitionRuntimeBundle = { bundleSchemaVersion: 1, contentId: 'bdm-phase1-competition-runtime-v1', contentHashAlgorithm: 'BLAKE3', contentHash: 'a'.repeat(64), worldDbSchema: 'DDL-PHASE1-A', competitionFormats: [leagueFormat(), cupFormat()], initialScoreDocuments: [] }
const selection: WorldDbGameBootstrapSelectionV1 = { source, ecosystemId: 'ecosystem:ESP:acb', competitionId: 'competition:ESP:liga-endesa', competitionSeasonId: 'edition:ESP:liga-endesa:2025-26', teamId: 'team:ESP:male:000' }

function values(keys: readonly string[], value = 60): Readonly<Record<string, number>> { return Object.fromEntries(keys.map((key, index) => [key, value + (index % 10)])) }
function slice(): WorldDbGameBootstrapSliceV1 {
  const teams = Array.from({ length: 18 }, (_, index) => ({ teamId: `team:ESP:male:${String(index).padStart(3, '0')}`, name: `Team ${index}`, gender: 'male' as const, countryId: 'place:country:ESP', organizationId: `organization:${index === 1 ? 0 : index}`, organizationSectionId: `section:${index}` }))
  const organizations = [...new Map(teams.map((team) => [team.organizationId, { organizationId: team.organizationId, entityId: `entity:${team.organizationId}`, legalName: `Legal ${team.organizationId}`, foundedYear: 1900, dissolvedYear: null, primaryPlaceId: 'place:country:ESP', website: null }])).values(), { organizationId: 'organization:holding', entityId: 'entity:organization:holding', legalName: 'Holding Organization', foundedYear: 2000, dissolvedYear: null, primaryPlaceId: null, website: null }]
  const organizationSections = teams.map((team) => ({ sectionId: team.organizationSectionId, organizationId: team.organizationId, sport: 'BASKETBALL', gender: 'MALE', categoryScope: null, canonicalName: team.name, validFrom: '1900-01-01', validTo: null }))
  const players = teams.flatMap((team, teamIndex) => ['PG', 'SG', 'SF', 'PF', 'C'].map((position, positionIndex) => ({ playerId: `${team.teamId}:person:${positionIndex}`, personId: `${team.teamId}:person:${positionIndex}`, primaryPosition: position as 'PG' | 'SG' | 'SF' | 'PF' | 'C', secondaryPositions: [], dominantHand: 'RIGHT' as const, ratings: values(PLAYER_TRUTH_RATING_KEYS), tendencies: values(PLAYER_TRUTH_TENDENCY_KEYS), development: ['SHOOTING', 'FINISHING', 'BALL_HANDLING', 'PLAYMAKING', 'OFF_BALL_OFFENSE', 'DEFENSE_REBOUNDING', 'PHYSICAL', 'MENTAL'].map((dimensionCode) => ({ dimensionCode, ceiling: 85 + (teamIndex % 10), growthRate: 50, declineSensitivity: 20 })) })))
  const staffProfiles = teams.map((team) => ({ staffId: `staff:${team.teamId}:head`, personId: `${team.teamId}:head-coach`, attributes: Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`STAFF_ATTRIBUTE_${String(index + 1).padStart(2, '0')}`, 60])), specialismIds: ['TACTICS'] }))
  const persons = [...players.map((player) => ({ personId: player.personId, firstName: player.personId.split(':').at(-2)!, lastName: 'Player', gender: 'male' as const, dateOfBirth: '1998-01-01', nationalityIds: ['place:country:ESP'], physical: { heightCm: 190, weightKg: 90, wingspanCm: 195, standingReachCm: 245 } })), ...staffProfiles.map((staff) => ({ personId: staff.personId, firstName: 'Head', lastName: staff.personId.split(':').at(-2)!, gender: 'male' as const, dateOfBirth: '1980-01-01', nationalityIds: ['place:country:ESP'], physical: { heightCm: 180, weightKg: 80, wingspanCm: 180, standingReachCm: 230 } })), { personId: 'person:owner-only', firstName: 'Owner', lastName: 'Only', nationalityIds: [] }]
  return { schemaVersion: 1, source, ecosystem: { ecosystemId: selection.ecosystemId, name: 'Spain ACB Ecosystem', kind: 'fibaLike', category: 'men' }, competition: { competitionId: selection.competitionId, name: 'Liga Endesa', gender: 'male', ecosystemId: selection.ecosystemId }, season: { competitionSeasonId: selection.competitionSeasonId, seasonId: 'season:2025_26', label: '2025-26', startDate: '2025-10-01', endDate: '2026-06-30', provenance: 'DERIVED_SIMULATION_FROM_B04' }, countries: [{ countryId: 'place:country:ESP', name: 'ESP', code: 'ESP' }], organizations, organizationSections, organizationOwnership: [{ ownershipId: 'ownership:worlddb', organizationId: teams[0]!.organizationId, ownerKind: 'PERSON', ownerId: 'person:owner-only', ownershipPercentage: 25, validFrom: '2025-10-01', validTo: null }], teams, persons, players, staffProfiles, staffAssignments: teams.map((team) => ({ assignmentId: `${team.teamId}:head-assignment`, staffId: `staff:${team.teamId}:head`, teamId: team.teamId, roleCode: 'headCoach', assignedOn: '2025-10-01' })), rosterAssignments: players.map((player) => ({ rosterId: `roster:${player.playerId.split(':').slice(0, 4).join(':')}`, teamId: player.playerId.split(':').slice(0, 4).join(':'), playerId: player.playerId, status: 'ACTIVE' })), matches: [] }
}
function sliceWithAssistantCoach(): WorldDbGameBootstrapSliceV1 {
  const base = slice()
  const team = base.teams.find((item) => item.teamId === selection.teamId)!
  const staffId = `staff:${team.teamId}:assistant`
  const personId = `${team.teamId}:assistant-coach`
  return {
    ...base,
    staffProfiles: [...base.staffProfiles, {
      staffId,
      personId,
      attributes: Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`STAFF_ATTRIBUTE_${String(index + 1).padStart(2, '0')}`, 60])),
      specialismIds: ['TRAINING'],
    }],
    persons: [...base.persons, { personId, firstName: 'Assistant', lastName: 'Coach', gender: 'male', dateOfBirth: '1982-01-01', nationalityIds: ['place:country:ESP'], physical: { heightCm: 180, weightKg: 80, wingspanCm: 180, standingReachCm: 230 } }],
    staffAssignments: [...base.staffAssignments, { assignmentId: `${team.teamId}:assistant-assignment`, staffId, teamId: team.teamId, roleCode: 'assistantCoach', assignedOn: '2025-10-01' }],
  }
}
function worldWithAssistantCoach() {
  return bootstrapGameWorldFromWorldDb(sliceWithAssistantCoach(), selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema })
}
function catalog(): WorldDbSelectionCatalogV1 { const teams = slice().teams; return { schemaVersion: 1, source, ecosystems: [{ ecosystemId: selection.ecosystemId, code: 'SPAIN_ACB', name: 'Spain ACB Ecosystem', gender: 'M' }], levels: [], units: [], competitionAssignments: [{ assignmentId: 'assignment:liga-endesa', ecosystemId: selection.ecosystemId, competitionId: selection.competitionId, competitionName: 'Liga Endesa', levelId: null, unitId: null, roleType: 'PRIMARY_LEAGUE' }], competitionSeasons: [{ competitionSeasonId: selection.competitionSeasonId, competitionId: selection.competitionId, competitionName: 'Liga Endesa', seasonId: 'season:2025_26', editionNumber: 1 }, { competitionSeasonId: spainCopaCompetitionSeasonId(2025), competitionId: 'competition:ESP:copa-del-rey', competitionName: 'Copa del Rey', seasonId: 'season:2025_26', editionNumber: 1 }], teamMemberships: teams.map((team) => ({ membershipId: `membership:${team.teamId}`, ecosystemId: selection.ecosystemId, teamId: team.teamId, teamName: team.name, levelId: null, unitId: null, membershipStatus: 'ACTIVE', validFrom: null, validTo: null })), teamUnitMemberships: [] } }
function repository(bootstrapSlice = slice()): WorldDatabaseRepository { const info: WorldDbDatabaseInfoV1 = { schemaVersion: 1, source, competitionSeasonIds: [selection.competitionSeasonId, spainCopaCompetitionSeasonId(2025)] }; return { inspectDatabase: vi.fn(async () => info), loadSelectionCatalog: vi.fn(async () => catalog()), loadCompetitionSeason: vi.fn(), loadMatchRealizations: vi.fn(), loadGameBootstrapSlice: vi.fn(async () => bootstrapSlice), loadCompetitionRuntimeBundle: vi.fn(async () => runtimeBundle) } }
function openSession(repo = repository()): WorldDbSessionV1 { return new WorldDbSessionV1({ repository: repo, databasePath: source.databaseId, runtimeBundlePath: 'runtime-bundle.json' }) }

// Explicit shared-authority projection. BS16 club accounting and BS17 physical attempt facts
// are additions, tested independently; they cannot be used to hide sporting/identity differences.
function sharedProjection(world: GameWorld) {
  const keys = ['currentDate', 'currentSeasonId', 'userCoachId', 'teams', 'players', 'personsById', 'coaches',
    'seasons', 'games', 'seasonHistoryBySeasonId', 'injuriesById', 'mediaOpportunitiesById',
    'talentCohortsById', 'talentMaterializationsByCandidateKey', 'playerEnrollmentsById',
    'developmentStimulusEventsById', 'developmentStimulusByPlayerId', 'moraleByPersonId', 'teamCohesionByTeamId', 'careerFatigueByPlayerId', 'coachFinancesByCoachId',
    'governanceDecisionsById'] as const satisfies readonly (keyof GameWorld)[]
  const sessions = Object.fromEntries(Object.entries(world.scheduledTrainingSessionsById).map(([id, session]) => [id,
    Object.fromEntries(Object.entries(session).filter(([key]) => key !== 'physicalAttempt'))]))
  return { ...Object.fromEntries(keys.map(key => [key, world[key as keyof GameWorld]])), scheduledTrainingSessionsById: sessions }
}
function reportV2(label: string, initial: GameWorld, world: GameWorld, facts: unknown) {
  process.stdout.write(`[World DB V2 differential] ${JSON.stringify({ label, seed: 151617,
    sourceFingerprint: fingerprint({ slice: slice(), selection, runtimeBundle }),
    initialShared: fingerprint(sharedProjection(initial)), finalShared: fingerprint(sharedProjection(world)), sharedFields: Object.fromEntries(Object.entries(sharedProjection(world)).map(([key, value]) => [key, fingerprint(value ?? null)])), facts })}\n`)
}

/** Transient test evidence only; synthetic/bounded runs do not identify the historical 2029 stop. */
function reportWorldDbStop(label: string, initial: GameWorld, target: string, result: SimulateUntilResult, seed: number, lastDay?: WorldDayAdvanceResult) {
  const relevantState = { date: initial.currentDate, userCoachId: initial.userCoachId, teams: initial.teams, players: initial.players,
    games: initial.games, seasons: initial.seasons, injuries: initial.injuriesById, media: initial.mediaOpportunitiesById }
  const diagnosis = {
    label, historicalStopRecovered: false,
    originDate: initial.currentDate, currentDate: result.world.currentDate,
    requestedTargetDate: target, actualReachedDate: result.finalDate, daysAdvanced: result.daysAdvanced,
    stopReason: result.stopReason,
    pendingDecisions: evaluateSimulationBreakpoints(result.world).candidates
      .filter(item => item.level === 'ACTION_REQUIRED' || item.level === 'BLOCKING')
      .map(item => ({ reason: item.reason, sourceKind: item.sourceKind, sourceId: item.sourceId, diagnostic: item.diagnostic })),
    relevantIds: { userCoachId: result.world.userCoachId, currentSeasonId: result.world.currentSeasonId,
      userTeamId: Object.values(result.world.teams).find(team => team.coachId === result.world.userCoachId)?.id },
    phase: lastDay?.phases.at(-1)?.phaseId ?? 'EXPLICIT_ADVANCE_PRECHECK',
    lastDayStatus: lastDay?.status ?? null,
    lastMatchOperation: lastDay?.phases.find(phase => phase.phaseId === 'MATCH_RESOLUTION')?.summary ?? null,
    completedGameIds: Object.values(result.world.games).filter(game => game.status === 'completed' && initial.games[game.id]?.status !== 'completed').map(game => game.id).sort(),
    lastOperation: lastDay?.phases.at(-1)?.summary ?? 'Required-decision projection before advancing',
    exceptionClassification: 'NO_EXCEPTION_RETURNED',
    replay: { matchSeed: seed, factory: 'injected constant MatchSeedFactory', productionRngChanged: false },
    sourceFixtureSha256: createHash('sha256').update(JSON.stringify({ slice: slice(), selection, runtimeBundle })).digest('hex'),
    relevantOriginStateSha256: createHash('sha256').update(JSON.stringify(relevantState)).digest('hex'),
  }
  process.stdout.write(`[World DB closure diagnostic] ${JSON.stringify(diagnosis)}\n`)
  return diagnosis
}

describe('World DB Spain ACB playable GameWorld bootstrap', () => {

  it('BS19C source-backed assistant meeting applies both perspectives, PERSON50 journal, and Save V4 once', () => {
    const historical = worldWithAssistantCoach()
    const assistant = Object.values(historical.teamStaffAssignmentsById).find(x => x.teamId === selection.teamId && x.role === 'assistantCoach')!
    const assistantBefore = historical.staffPeopleById[assistant.staffPersonId]!
    const world = appointCreatedUserCoachToWorldDbClub(historical, selection.teamId as never, {
      firstName: 'Elena', lastName: 'Carrera', dateOfBirth: '1993-04-25',
      gender: 'female', background: 'academyCoach', ambition: 'talentDeveloper', disposition: 'ambitious', coachingStyle: 'developer',
    })
    const coach = world.coaches[world.userCoachId]!
    const pending = getPendingFirstStaffMeeting(world)
    expect(pending).toMatchObject({ assistantStaffId: assistant.staffPersonId, teamId: selection.teamId })
    expect(world.inboxItemsById[firstStaffMeetingInboxId(coach.id, assistant.staffPersonId)]?.status).toBe('unread')
    expect(queueFirstStaffMeeting(world)).toBe(world)
    expect(Object.values(world.relationshipsByKey).some(item => item.events.some(e => e.context.scenario === 'firstStaffMeeting'))).toBe(false)
    const handled = decideFirstStaffMeeting(world, assistant.staffPersonId, 'seekInput')
    expect(handled.status).toBe('APPLIED')
    if (handled.status !== 'APPLIED') throw new Error('Expected meeting')
    const after = handled.world
    const fromCoach = after.relationshipsByKey[relationshipKey(coach.id, assistant.staffPersonId)]!
    const fromAssistant = after.relationshipsByKey[relationshipKey(assistant.staffPersonId, coach.id)]!
    expect(fromCoach.value).toBeGreaterThan(0)
    expect(fromAssistant.value).toBeGreaterThan(0)
    expect(getRelationshipDimensions(fromAssistant).perceivedSupport).toBeGreaterThan(0)
    expect(getRelationshipDimensions(fromCoach).collaboration).toBeGreaterThan(0)
    expect(after.memoriesById[`memory:bs19c:first-staff-meeting:${coach.id}:${assistant.staffPersonId}:coach`]?.context.choice).toBe('seekInput')
    expect(after.memoriesById[`memory:bs19c:first-staff-meeting:${coach.id}:${assistant.staffPersonId}:assistant`]?.context.choice).toBe('seekInput')
    const eventId = `morale:bs19c:first-staff-meeting:${coach.id}:${assistant.staffPersonId}:coach`
    expect(after.moraleByPersonId[coach.id]?.events.find(item => item.id === eventId)).toMatchObject({
      source: 'professionalInteraction', context: { personalityEventKind: 'TEAM_MEETING', choice: 'seekInput' },
    })
    const journal = after.personalityHistoryByPersonId[coach.id]!
    expect(journal.find(entry => entry.sourceEventId === eventId)?.dimensionCode).toBe('communication')
    expect(after.personalitiesByPersonId[coach.staffProfileId]).toEqual(after.personalitiesByPersonId[coach.id])
    expect(after.staffPeopleById[assistant.staffPersonId]).toEqual(assistantBefore)
    expect(getPendingFirstStaffMeeting(after)).toBeNull()
    expect(decideFirstStaffMeeting(after, assistant.staffPersonId, 'setDirection')).toMatchObject({ status: 'BLOCKED', reason: 'NO_ACTIVE_MEETING', world: after })
    const restored = deserializeGameWorldV4(serializeGameWorldV4(after, '2026-10-18T11:00:00.000Z'))
    expect(restored.personalityHistoryByPersonId[coach.id]).toEqual(journal)
    expect(restored.relationshipsByKey[relationshipKey(assistant.staffPersonId, coach.id)]).toEqual(fromAssistant)
    expect(restored.memoriesById).toEqual(after.memoriesById)
    expect(getPendingFirstStaffMeeting(restored)).toBeNull()
    expect(queueFirstStaffMeeting(restored)).toBe(restored)
  }, 120_000)

  it('BS19C imported staff missing DOB can attend a meeting without false PERSON50 evolution', () => {
    const initial = worldWithAssistantCoach()
    const assistant = Object.values(initial.teamStaffAssignmentsById).find(x => x.teamId === selection.teamId && x.role === 'assistantCoach')!
    const started = appointCreatedUserCoachToWorldDbClub(initial, selection.teamId as never, {
      firstName: 'Elena', lastName: 'Carrera', dateOfBirth: '1993-04-25',
      gender: 'female', background: 'rookie', disposition: 'balanced', coachingStyle: 'balanced',
    })
    const staffId = assistant.staffPersonId
    const staff = started.staffPeopleById[staffId]!
    const staffPerson = started.personsById[staff.personId!]!
    const { dateOfBirth: _staffBirth, ...identityWithoutDob } = staff.identity
    const { dateOfBirth: _personBirth, ...personWithoutDob } = staffPerson
    const withoutDob = updateGameWorld(started, {
      persons: Object.values(started.personsById).map(item => item.id === staffPerson.id ? personWithoutDob : item),
      staffPeople: Object.values(started.staffPeopleById).map(item => item.id === staffId ? { ...item, identity: identityWithoutDob } : item),
      personalitiesByPersonId: {
        ...started.personalitiesByPersonId,
        [staffId]: started.personalitiesByPersonId[started.userCoachId]!,
      },
    })
    const applied = decideFirstStaffMeeting(withoutDob, staffId, 'seekInput')
    expect(applied.status).toBe('APPLIED')
    if (applied.status !== 'APPLIED') throw new Error('Meeting should remain available')
    const eventId = `morale:bs19c:first-staff-meeting:${withoutDob.userCoachId}:${staffId}:assistant`
    const actual = applied.world.moraleByPersonId[staffId]!.events.find(item => item.id === eventId)!
    expect(actual).toBeDefined()
    expect(actual.context).not.toHaveProperty('personalityEventKind')
    expect(applied.world.personalityHistoryByPersonId[staffId]).toBeUndefined()
    expect(applied.world.relationshipsByKey[relationshipKey(staffId, withoutDob.userCoachId)]).toBeDefined()
    expect(applied.world.staffPeopleById[staffId]!.identity.dateOfBirth).toBeUndefined()
  }, 120_000)

  it('BS19C directive first meeting can cause friction without rewriting staff identities; no invented staff without assignment', () => {
    const initial = worldWithAssistantCoach()
    const assistant = Object.values(initial.teamStaffAssignmentsById).find(x => x.teamId === selection.teamId && x.role === 'assistantCoach')!
    const input = { firstName: 'Elena', lastName: 'Carrera', dateOfBirth: '1993-04-25', gender: 'female' as const,
      background: 'rookie' as const, ambition: 'firstTitle' as const, disposition: 'loyal' as const, coachingStyle: 'balanced' as const }
    const started = appointCreatedUserCoachToWorldDbClub(initial, selection.teamId as never, input)
    const coachId = started.userCoachId
    const other = started.staffPeopleById[assistant.staffPersonId]!
    const applied = decideFirstStaffMeeting(started, assistant.staffPersonId, 'setDirection')
    expect(applied.status).toBe('APPLIED')
    if (applied.status !== 'APPLIED') throw new Error('Meeting not applied')
    expect(applied.world.relationshipsByKey[relationshipKey(assistant.staffPersonId, coachId)]?.value).toBeLessThan(0)
    expect(applied.world.moraleByPersonId[assistant.staffPersonId]!.value).toBeLessThan(started.moraleByPersonId[assistant.staffPersonId]!.value)
    expect(applied.world.staffPeopleById[other.id]).toEqual(other)
    expect(decideFirstStaffMeeting(started, assistant.staffPersonId, 'fakeChoice' as never)).toMatchObject({
      status: 'BLOCKED', reason: 'INVALID_CHOICE', world: started,
    })
    expect(decideFirstStaffMeeting(started, assistant.staffPersonId, 'seekInput', 'another-coach' as never)).toMatchObject({
      status: 'BLOCKED', reason: 'NOT_USER_COACH', world: started,
    })

    const noAssistant = bootstrapGameWorldFromWorldDb(slice(), selection, {
      contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema,
    })
    const newCoach = appointCreatedUserCoachToWorldDbClub(noAssistant, selection.teamId as never, input)
    expect(getPendingFirstStaffMeeting(newCoach)).toBeNull()
  }, 120_000)

  it('BS19B launches a real configured WorldDB career with a custom manager and the club Board', async () => {
    const access = { repository: repository(), databasePath: source.databaseId, runtimeBundlePath: 'runtime-bundle.json' }
    const world = await createConfiguredGameAsync({
      universeId: 'worldDbSpain',
      userTeamKey: selection.teamId,
      userCoachCreation: {
        firstName: 'Lucía', lastName: 'Núñez', gender: 'female', dateOfBirth: '1992-09-13',
        background: 'rookie', ambition: 'talentDeveloper', biography: 'Former youth academy coach.', disposition: 'loyal', coachingStyle: 'developer',
      },
    }, access)
    const coach = world.coaches[world.userCoachId]!
    expect(coach.firstName).toBe('Lucía')
    expect(coach.lastName).toBe('Núñez')
    expect(world.personsById[coach.personId]?.dateOfBirth).toBe('1992-09-13')
    expect(world.coachRpgProfilesByCoachId[coach.id]?.creatorOrigin).toEqual({ background: 'rookie', ambition: 'talentDeveloper', biography: 'Former youth academy coach.' })
    expect(world.teams[selection.teamId as never]?.coachId).toBe(coach.id)
    expect(Object.values(world.coaches).some(item => item.id !== coach.id && item.firstName === 'Head')).toBe(true)
    expect(world.boardStatesByTeamId[selection.teamId as never]).toBeDefined()
    expect(world.worldDbCompetitionRuntime?.competitionRuntimeBundle).not.toBeNull()
    expect(Object.values(world.coachJobOffersById).some(x => x.coachId === coach.id && x.status === 'accepted')).toBe(true)
    const observedOffer = Object.values(world.coachJobOffersById).find(x => x.coachId === coach.id && x.status === 'accepted')!
    const event = world.moraleByPersonId[coach.id]?.events.find(x => x.id === `morale:bs19c:contract-offer-accepted:${observedOffer.id}:${coach.id}`)
    expect(event).toMatchObject({
      personId: coach.id,
      source: 'careerEvent',
      delta: 12,
      context: {
        personalityEventKind: 'CONTRACT_OFFER_ACCEPTED',
        offerId: observedOffer.id,
        teamId: selection.teamId,
        proof: 'coachCareer:acceptedJobOffer',
      },
    })
    expect(world.personsById[coach.personId]?.dateOfBirth).toBeDefined()

    expect(Object.values(world.inboxItemsById).filter(x => x.coachId === coach.id && x.action?.type === 'coachJobOffer').every(x => x.status === 'archived')).toBe(true)
    expect(Object.values(world.staffContractsById).some(x => x.staffId === coach.staffProfileId && x.termination === undefined)).toBe(true)
  }, 120_000)

  it('BS19B creates a distinct head coach, keeps historical PERSON intact and round-trips Save V4', () => {
    const initial = worldWithAssistantCoach()
    const oldCoach = initial.coaches[initial.userCoachId]!
    const oldPerson = initial.personsById[oldCoach.personId]!
    const oldStaff = initial.staffPeopleById[oldCoach.staffProfileId]!
    const oldStaffAssignment = Object.values(initial.teamStaffAssignmentsById).find(x => x.staffPersonId === oldStaff.id)
    const otherPeopleCount = Object.keys(initial.personsById).length
    const personForOwner = initial.personsById['person:owner-only' as never]
    const world = appointCreatedUserCoachToWorldDbClub(initial, selection.teamId as never, {
      firstName: 'Elena', lastName: 'Carrera', dateOfBirth: '1993-04-25',
      gender: 'female', background: 'inDebt', ambition: 'financialFreedom', biography: 'A fictional, self-created background.', disposition: 'ambitious', coachingStyle: 'tactician',
    })
    const coach = world.coaches[world.userCoachId]!
    expect(coach.id).not.toBe(oldCoach.id)
    expect(coach.personId).not.toBe(oldCoach.personId)
    expect(coach.staffProfileId).not.toBe(oldCoach.staffProfileId)
    expect(coach.firstName).toBe('Elena')
    expect(world.personsById[coach.personId]).toMatchObject({
      firstName: 'Elena', lastName: 'Carrera', dateOfBirth: '1993-04-25', gender: 'female',
    })
    expect(world.teams[selection.teamId as never]?.coachId).toBe(coach.id)
    expect(world.staffPeopleById[coach.staffProfileId]?.identity.firstName).toBe('Elena')
    expect(world.staffEmploymentByStaffId[coach.staffProfileId]?.status).toBe('employed')
    expect(world.coachEmploymentByCoachId[coach.id]?.status).toBe('employed')
    expect(world.coachCareerHistoryByCoachId[coach.id]?.at(-1)?.kind).toBe('appointment')
    expect(world.staffCareerHistoryByStaffId[coach.staffProfileId]?.at(-1)?.kind).toBe('appointment')
    expect(world.coachFinancesByCoachId[coach.id]?.debts[0]?.principalRemaining).toBe(30_000)
    expect(Object.keys(world.personalitiesByPersonId[coach.id]!.values)).toHaveLength(50)
    expect(world.personalitiesByPersonId[coach.id]).toEqual(world.personalitiesByPersonId[coach.staffProfileId])
    expect(Object.keys(initial.personalitiesByPersonId[oldCoach.id]!.values)).toHaveLength(8)
    expect(world.personalitiesByPersonId[oldCoach.id]).toEqual(initial.personalitiesByPersonId[oldCoach.id])

    // BS19C: the same sourced WorldDB appointment exposes a causal personal dilemma
    // only because this fictional coach was explicitly created with starting debt.
    expect(Object.values(world.inboxItemsById).filter(item => item.context.lifeScenario === 'openingDebt')).toEqual([
      expect.objectContaining({ coachId: coach.id, status: 'unread' }),
    ])
    expect(Object.values(world.staffContractsById).filter(x => x.staffId === coach.staffProfileId && !x.termination)).toHaveLength(1)

    expect(world.coaches[oldCoach.id]).toEqual(oldCoach)
    expect(world.personsById[oldPerson.id]).toEqual(oldPerson)
    expect(world.staffPeopleById[oldStaff.id]).toEqual(oldStaff)
    expect(world.staffEmploymentByStaffId[oldStaff.id]?.status).toBe('unemployed')
    expect(world.coachEmploymentByCoachId[oldCoach.id]?.status).toBe('unemployed')
    expect(Object.values(world.teamStaffAssignmentsById).some(a => a.id === oldStaffAssignment?.id)).toBe(false)
    expect(Object.values(world.staffContractsById).filter(x => x.staffId === oldStaff.id).every(x => x.termination !== undefined)).toBe(true)
    expect(world.personsById['person:owner-only' as never]).toEqual(personForOwner)
    expect(Object.keys(world.personsById)).toHaveLength(otherPeopleCount + 1)
    expect(world.coachJobOffersById[Object.keys(world.coachJobOffersById)[0] as never]?.status).toBe('accepted')

    const restored = deserializeGameWorldV4(serializeGameWorldV4(world, '2026-10-17T21:00:00.000Z'))
    expect(restored.userCoachId).toBe(world.userCoachId)
    expect(restored.coaches[oldCoach.id]).toEqual(oldCoach)
    expect(restored.personsById[oldPerson.id]).toEqual(oldPerson)
    expect(restored.personsById[coach.personId].dateOfBirth).toBe('1993-04-25')
    expect(restored.staffPeopleById[coach.staffProfileId].id).toBe(coach.staffProfileId)
    expect(restored.coachFinancesByCoachId[coach.id]?.debts[0]?.principalRemaining).toBe(30_000)
    expect(restored.coachRpgProfilesByCoachId[coach.id]?.creatorOrigin).toEqual({ background: 'inDebt', ambition: 'financialFreedom', biography: 'A fictional, self-created background.' })
    const offer = Object.values(world.coachJobOffersById).find(x => x.coachId === coach.id && x.status === 'accepted')!
    const eventId = `morale:bs19c:contract-offer-accepted:${offer.id}:${coach.id}`
    expect(world.moraleByPersonId[coach.id]?.events.filter(x => x.id === eventId)).toHaveLength(1)
    const observedJournal = world.personalityHistoryByPersonId[coach.id]
    expect(observedJournal).toHaveLength(1)
    expect(observedJournal![0]).toMatchObject({
      sourceEventId: eventId,
      dimensionCode: 'decisionPatience',
      personId: coach.id,
    })
    expect(observedJournal![0]!.newValue).toBe(observedJournal![0]!.previousValue + 1)
    expect(restored.personalityHistoryByPersonId[coach.id]).toEqual(observedJournal)
    expect(restored.personalitiesByPersonId[coach.id]).toEqual(world.personalitiesByPersonId[coach.staffProfileId])

    expect(restored.moraleByPersonId[coach.id]?.events.filter(x => x.id === eventId)).toEqual(world.moraleByPersonId[coach.id]?.events.filter(x => x.id === eventId))
    // PERSON50 is now active for the fictional user Coach; historical identities remain sourced.
    expect(restored.personalitiesByPersonId[coach.id]).toEqual(world.personalitiesByPersonId[coach.id])
  }, 120_000)

  it('V2 differential: Medical review is a coherent required stop, with only the explicit fixture decision executed', async () => {
    const initial = await createWorldDbSpainGame(selection.teamId, { repository: repository(slice()), databasePath: source.databaseId, runtimeBundlePath: 'runtime-bundle.json' })
    const team = Object.values(initial.teams).find(item => item.coachId === initial.userCoachId)!
    const injury = createInjury({ id: injuryIdFromString('v2:medical'), playerId: team.rosterPlayerIds[0]!, kind: 'ankleSprain', severity: 'moderate', injuredOn: addDays(initial.currentDate, -10), expectedReturnDate: initial.currentDate })
    const due = updateGameWorld(initial, { injuries: [injury] })
    const before = serializeGameWorldV4(due, '2025-10-01T00:00:00.000Z')
    let seedCalls = 0
    const stopped = simulateUntilDate(due, addDays(due.currentDate, 1), () => { seedCalls++; return 151617 })
    expect(stopped).toMatchObject({ finalDate: due.currentDate, daysAdvanced: 0, stopReason: { type: 'breakpoint', breakpoint: { reason: 'returnToPlayReview', sourceKind: 'USER_RTP_REVIEW', sourceId: injury.id, effectiveDate: due.currentDate, route: 'medical' } } })
    expect(seedCalls).toBe(0)
    expect(classifyContinueEvidence(stopped, addDays(due.currentDate, 1))).toBe('CANONICAL_DECISION')
    expect(serializeGameWorldV4(due, '2025-10-01T00:00:00.000Z')).toEqual(before)
    const loaded = deserializeGameWorldV4(before)
    expect(getExplicitAdvanceStopReason(loaded)).toEqual(stopped.stopReason)
    // Explicit fixture choice: defer the review. Never auto-clear or bypass clinical authority.
    const choice = reviewReturnToPlay(loaded, { injuryId: injury.id, decision: 'CONTINUE_RECOVERY', actor: { kind: 'USER', coachId: loaded.userCoachId } })
    expect(choice.ok).toBe(true)
    if (!choice.ok) throw new Error(choice.reason)
    expect(choice.world.injuriesById[injury.id]?.expectedReturnDate).toBe(injury.expectedReturnDate)
    expect(choice.world.injuriesById[injury.id]?.returnToPlay?.reviewDueOn).toBe(addDays(due.currentDate, 1))
    reportV2('medical-review', due, choice.world, { stopReason: stopped.stopReason, decision: 'CONTINUE_RECOVERY', seedCalls })
  }, 120_000)

  it('V2 differential: SeasonComplete stops Continue, while an explicit rollover preserves sporting consequences and identity', async () => {
    const initial = await createWorldDbSpainGame(selection.teamId, { repository: repository(slice()), databasePath: source.databaseId, runtimeBundlePath: 'runtime-bundle.json' })
    // Bounded season-end fixture: supplied completed scores, not a longitudinal simulation.
    let completed = initial
    for (let stage = 0; stage < 32; stage++) {
      const scheduled = Object.values(completed.games).filter(game => game.status === 'scheduled')
      if (!scheduled.length) break
      completed = withSingleWorldValidation(completed, world => {
        let current = world
        for (const game of scheduled) current = applyMatchResult(current, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 100, awayScore: 80 })
        return current
      })
    }
    expect(Object.values(completed.games).filter(game => game.status === 'scheduled')).toHaveLength(0)
    for (const season of Object.values(completed.seasons)) {
      if (isSeasonComplete(completed, season.id)) completed = finalizeCompletedSeason(completed, season.id)
    }
    let atEnd = updateGameWorld(completed, { currentDate: parseGameDate('2026-06-30') })
    // Explicit fixture decisions, through the canonical Media command, to isolate SeasonComplete.
    const mediaChoices = Object.values(atEnd.mediaOpportunitiesById).filter(item => item.status === 'pending').map(item => item.id).sort()
    for (const opportunityId of mediaChoices) atEnd = skipMediaOpportunity(atEnd, opportunityId)
    const stopped = continueGame(atEnd, 1, () => 151617)
    expect(stopped, JSON.stringify(stopped.stopReason)).toMatchObject({ daysAdvanced: 0, finalDate: atEnd.currentDate, stopReason: { type: 'seasonComplete', breakpoint: { sourceKind: 'SEASON_LIFECYCLE', sourceId: atEnd.currentSeasonId } } })
    expect(classifyContinueEvidence(stopped, addDays(atEnd.currentDate, 1))).toBe('CANONICAL_DECISION')
    const rolled = startNextSeason(atEnd)
    expect(rolled.currentDate).toBe(atEnd.currentDate)
    expect(Object.keys(rolled.seasons).length).toBeGreaterThan(Object.keys(atEnd.seasons).length)
    expect(startNextSeasonFor(rolled, atEnd.currentSeasonId)).toBe(rolled)
    expect(rolled.seasonHistoryBySeasonId[atEnd.currentSeasonId]).toEqual(atEnd.seasonHistoryBySeasonId[atEnd.currentSeasonId])
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(rolled, '2026-06-30T00:00:00.000Z'))
    expect(sharedProjection(loaded)).toEqual(sharedProjection(rolled))
    reportV2('season-complete-rollover', atEnd, loaded, { stopReason: stopped.stopReason, mediaChoices: mediaChoices.map(opportunityId => ({ command: 'skipMediaOpportunity', opportunityId })), newSeasons: Object.keys(rolled.seasons).filter(id => !atEnd.seasons[id as never]).sort() })
  }, 120_000)

  it('V2 differential: Calendar sync and async publish the same shared authorities exactly once', async () => {
    const initial = await createWorldDbSpainGame(selection.teamId, { repository: repository(slice()), databasePath: source.databaseId, runtimeBundlePath: 'runtime-bundle.json' })
    const before = serializeGameWorldV4(initial, '2025-10-01T00:00:00.000Z')
    const sync = advanceGameDayWithResult(initial, () => 151617, ['userGame'], { forceDetail: 'BACKGROUND' })
    const runner = createInlineMatchRunner()
    try {
      const asyncResult = await advanceGameDayWithResultAsync(initial, runner, () => 151617, ['userGame'], { forceDetail: 'BACKGROUND' })
      expect(sync.failure).toBeUndefined()
      expect(asyncResult.failure).toBeUndefined()
      expect(serializeGameWorldV4(asyncResult.world, '2025-10-01T00:00:00.000Z')).toEqual(serializeGameWorldV4(sync.world, '2025-10-01T00:00:00.000Z'))
      expect(sync.phases.filter(phase => phase.phaseId === 'DAY_PUBLICATION')).toHaveLength(1)
      expect(new Set(sync.phases.map(phase => phase.phaseId)).size).toBe(sync.phases.length)
      expect(serializeGameWorldV4(initial, '2025-10-01T00:00:00.000Z')).toEqual(before)
      reportV2('calendar-sync-async', initial, sync.world, { date: sync.world.currentDate, publications: 1 })
    } finally { runner.dispose() }
  }, 120_000)

  it('V2 differential: Talent materialization preserves seeded identity and repeated supply is a no-op', async () => {
    const initial = await createWorldDbSpainGame(selection.teamId, { repository: repository(slice()), databasePath: source.databaseId, runtimeBundlePath: 'runtime-bundle.json' })
    const place = createPlace({ id: 'v2:place', kind: 'CITY', name: 'Explicit fixture city', countryId: initial.players[Object.keys(initial.players)[0] as never]!.nationalityId })
    const cohort = createTalentCohort({ id: 'v2:cohort', placeId: place.id, birthYear: 2008, generationYear: 2025, gender: 'male', seed: 151617, inputs: { ageCohortPopulation: 100, basketballParticipationPerThousand: 100, accessOpportunityBasisPoints: 10000 }, inputVersion: 'v2-fixture-v1' })
    const ready = updateGameWorld(initial, { places: [place], talentCohorts: [cohort] })
    const created = materializeTalentCandidate(ready, cohort.id, 1, 'SCOUTING_DISCOVERY')
    expect(created.created).toBe(true)
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(created.world, '2025-10-01T00:00:00.000Z'))
    const replay = materializeTalentCandidate(loaded, cohort.id, 1, 'SCOUTING_DISCOVERY')
    expect(replay.created).toBe(false)
    expect(replay.player).toEqual(created.player)
    expect(replay.world).toBe(loaded)
    reportV2('talent-materialization', ready, replay.world, { playerId: created.player.id, cohort, created: created.created, replayCreated: replay.created })
  }, 120_000)

  it.each(['FULL', 'OUT_OF_SERVICE', 'UNKNOWN'] as const)('V2 differential: Training physical resource %s preserves unrelated authorities', async serviceability => {
    const initial = await createWorldDbSpainGame(selection.teamId, { repository: repository(slice()), databasePath: source.databaseId, runtimeBundlePath: 'runtime-bundle.json' })
    const team = Object.values(initial.teams).find(item => item.coachId === initial.userCoachId)!
    const place = createPlace({ id: 'v2:training-place', kind: 'CAMPUS', name: 'Explicit fixture campus' })
    const facility = createFacility({ id: 'v2:facility', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Explicit fixture center' })
    const component = createFacilityComponent({ id: 'v2:court', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE', specification: { kind: 'COURT', isFullCourt: true, isIndoor: true } })
    const physical = serviceability === 'UNKNOWN' ? initial : updateGameWorld(initial, { places: [place], facilities: [facility], facilityComponents: [component], facilityComponentConditionRecords: [createFacilityComponentConditionRecord({ id: 'v2:condition', componentId: component.id, effectiveFrom: initial.currentDate, physicalCondition: 80, serviceability })], facilityUsageRights: [createFacilityUsageRight({ id: 'v2:right', facilityId: facility.id, teamId: team.id, purpose: 'OTHER', exclusivity: 'SHARED', validFrom: initial.currentDate })] })
    const ready = scheduleTrainingSessionsBatch(physical, [createScheduledTrainingSession({ id: 'v2:training', teamId: team.id, date: addDays(physical.currentDate, 1), startTime: '10:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })])
    const onDate = updateGameWorld(ready, { currentDate: addDays(ready.currentDate, 1) }) // Explicit initial execution date, not an advance bypass.
    const executed = executeScheduledTrainingSessions(onDate)
    const session = executed.scheduledTrainingSessionsById['v2:training']!
    // Explicit version difference: BS15 has no Training P0 consumer. Never relax other projections.
    const hasPhysicalPolicy = session.physicalAttempt !== undefined
    expect(session.status).toBe(hasPhysicalPolicy && serviceability === 'OUT_OF_SERVICE' ? 'scheduled' : 'completed')
    expect(executed.injuriesById).toEqual(ready.injuriesById)
    expect(executed.talentMaterializationsByCandidateKey).toEqual(ready.talentMaterializationsByCandidateKey)
    expect(executeScheduledTrainingSessions(executed)).toEqual(executed)
    reportV2(`training-${serviceability}`, onDate, executed, { status: session.status, hasPhysicalPolicy, physicalAttempt: session.physicalAttempt ?? null,
      stimulus: Object.values(executed.developmentStimulusEventsById).filter(event => event.sourceId === session.id),
      unrelated: fingerprint({ games: executed.games, seasons: executed.seasons, talent: executed.talentCohortsById, injuries: executed.injuriesById, governance: executed.governanceDecisionsById }) })
  }, 120_000)

  it('V2 differential: shared Coach Finance monthly execution is exactly once', async () => {
    const initial = await createWorldDbSpainGame(selection.teamId, { repository: repository(slice()), databasePath: source.databaseId, runtimeBundlePath: 'runtime-bundle.json' })
    const processed = processCoachFinancesForMonth(initial)
    expect(processCoachFinancesForMonth(processed)).toEqual(processed)
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(processed, '2025-10-01T00:00:00.000Z'))
    expect(processCoachFinancesForMonth(loaded)).toEqual(loaded)
    reportV2('coach-finance-exactly-once', initial, loaded, { profiles: loaded.coachFinancesByCoachId })
  }, 120_000)

  it('closure diagnostic: resolves the first scheduled match day from the original World DB fixture with a replayable seed', async () => {
    const initial = await createWorldDbSpainGame(selection.teamId, { repository: repository(slice()), databasePath: source.databaseId, runtimeBundlePath: 'runtime-bundle.json' })
    const before = serializeGameWorldV4(initial, '2025-10-01T00:00:00.000Z')
    const firstUserGame = Object.values(initial.games).filter(game => game.status === 'scheduled' && [game.homeTeamId, game.awayTeamId].includes(selection.teamId as never)).sort((a, b) => a.date.localeCompare(b.date))[0]!
    const target = addDays(firstUserGame.date, 1)
    let lastDay: WorldDayAdvanceResult | undefined
    const result = simulateUntilDate(initial, target, () => 151617, { onDayAdvance: day => { lastDay = day } })
    reportWorldDbStop('bounded-original-fixture', initial, target, result, 151617, lastDay)
    expect(classifyContinueEvidence(result, target)).toBe('ARRIVED')
    expect(result).toMatchObject({ finalDate: target, daysAdvanced: 4, stopReason: { type: 'arrived' } })
    expect(Object.values(result.world.games).some(game => game.status === 'completed')).toBe(true)
    expect(lastDay?.phases.find(phase => phase.phaseId === 'MATCH_RESOLUTION')?.ran).toBe(true)
    expect(lastDay?.failure).toBeUndefined()
    expect(lastDay?.phases.at(-1)?.phaseId).toBe('DAY_COMPLETE')
    expect(serializeGameWorldV4(initial, '2025-10-01T00:00:00.000Z')).toEqual(before)
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(result.world, '2025-10-02T00:00:00.000Z'))
    expect(loaded.currentDate).toBe(result.finalDate)
    expect(getExplicitAdvanceStopReason(loaded)).toEqual(getExplicitAdvanceStopReason(result.world))
  }, 120_000)

  it('closure diagnostic: preserves a controlled media stop through save/reload until its explicit canonical command', async () => {
    const initial = await createWorldDbSpainGame(selection.teamId, { repository: repository(slice()), databasePath: source.databaseId, runtimeBundlePath: 'runtime-bundle.json' })
    const game = Object.values(initial.games).find(item => item.status === 'scheduled' && [item.homeTeamId, item.awayTeamId].includes(selection.teamId as never))!
    expect(game).toBeDefined()
    // Explicit controlled fixture fact, not a reconstruction of June 2029.
    const important = updateGameWorld(initial, { games: [{ ...game, stakes: 'final' }] })
    const world = createPreMatchMediaOpportunity(important, game.id)
    const opportunity = Object.values(world.mediaOpportunitiesById).find(item => item.status === 'pending')!
    expect(opportunity).toBeDefined()
    const before = serializeGameWorldV4(world, '2025-10-01T00:00:00.000Z')
    let seedCalls = 0
    const stopped = simulateUntilDate(world, addDays(world.currentDate, 1), () => { seedCalls += 1; return 151617 })
    const diagnosis = reportWorldDbStop('controlled-media-fixture', world, addDays(world.currentDate, 1), stopped, 151617)
    expect(stopped).toMatchObject({ world, finalDate: world.currentDate, daysAdvanced: 0, stopReason: { type: 'mediaOpportunity', opportunityId: opportunity.id } })
    expect(stopped.stopReason).toEqual(getExplicitAdvanceStopReason(world))
    expect(diagnosis.pendingDecisions).toContainEqual(expect.objectContaining({ reason: 'mediaOpportunity', sourceId: opportunity.id }))
    expect(seedCalls).toBe(0)
    expect(serializeGameWorldV4(world, '2025-10-01T00:00:00.000Z')).toEqual(before)
    const loaded = deserializeGameWorldV4(before)
    expect(simulateUntilDate(loaded, addDays(loaded.currentDate, 1), () => 151617).stopReason).toEqual(stopped.stopReason)
    const resolved = skipMediaOpportunity(loaded, opportunity.id)
    expect(resolved.mediaOpportunitiesById[opportunity.id]?.status).toBe('skipped')
    expect(getExplicitAdvanceStopReason(resolved)).toBeUndefined()
    expect(skipMediaOpportunity(resolved, opportunity.id)).toEqual(resolved)
    for (const key of ['injuriesById', 'financialTransactionsById', 'governanceDecisionsById'] as const satisfies readonly (keyof GameWorld)[]) expect(resolved[key]).toEqual(loaded[key])
  }, 120_000)

  it('materializes imported Staff career state and supports delegated team Training planning', () => {
    const world = worldWithAssistantCoach()
    for (const item of Object.values(world.teamStaffAssignmentsById)) {
      expect(world.staffEmploymentByStaffId[item.staffPersonId]).toEqual({ status: 'employed', teamId: item.teamId, roleId: item.role, startedOn: item.assignedOn })
      expect(Object.values(world.staffContractsById).filter((contract) => contract.staffId === item.staffPersonId && contract.termination === undefined)).toHaveLength(1)
    }
    const assignment = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === selection.teamId && item.role === 'assistantCoach')!
    expect(world.staffCareerHistoryByStaffId[assignment.staffPersonId]).toContainEqual({ kind: 'appointment', staffId: assignment.staffPersonId, teamId: assignment.teamId, roleId: assignment.role, date: assignment.assignedOn, reason: 'initialAppointment' })

    const candidates = getEligibleResponsibilityCandidates(world, assignment.teamId, 'createTeamTrainingPlan', 'delegated')
    expect(candidates.map((candidate) => candidate.staffPersonId)).toContain(assignment.staffPersonId)
    const delegated = setTeamResponsibility(world, { teamId: assignment.teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: assignment.staffPersonId })
    expect(delegated.responsibilitiesById[`responsibility:${assignment.teamId}:createTeamTrainingPlan` as never]).toMatchObject({ mode: 'delegated', holderStaffId: assignment.staffPersonId })
    expect(resolveDelegatedResponsibility(delegated, assignment.teamId, 'createTeamTrainingPlan')?.staffId).toBe(assignment.staffPersonId)

    const restored = deserializeGameWorldV4(serializeGameWorldV4(delegated, '2026-09-01T00:00:00.000Z'))
    expect(restored.staffEmploymentByStaffId[assignment.staffPersonId]).toEqual(delegated.staffEmploymentByStaffId[assignment.staffPersonId])
    expect(restored.staffContractsById).toEqual(delegated.staffContractsById)
    expect(getEligibleResponsibilityCandidates(restored, assignment.teamId, 'createTeamTrainingPlan', 'delegated').map((candidate) => candidate.staffPersonId)).toContain(assignment.staffPersonId)
    expect(restored.responsibilitiesById[`responsibility:${assignment.teamId}:createTeamTrainingPlan` as never]).toMatchObject({ mode: 'delegated', holderStaffId: assignment.staffPersonId })
  })

  it('repairs pre-fix V4 saves with assigned Staff but empty career runtime deterministically', () => {
    const world = worldWithAssistantCoach()
    const assignment = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === selection.teamId && item.role === 'assistantCoach')!
    const saved = structuredClone(serializeGameWorldV4(world, '2026-09-01T00:00:00.000Z'))
    const runtime = (saved.payload as unknown as Record<string, unknown>).staffCareerRuntime as Record<string, unknown>
    runtime.staffEmployment = []
    runtime.staffCareerHistory = []
    runtime.staffContracts = []
    runtime.staffReputationProfiles = []

    const repaired = deserializeGameWorldV4(saved)
    const repeated = deserializeGameWorldV4(saved)
    expect(repaired.staffEmploymentByStaffId[assignment.staffPersonId]).toEqual({ status: 'employed', teamId: assignment.teamId, roleId: assignment.role, startedOn: assignment.assignedOn })
    expect(repaired.staffCareerHistoryByStaffId[assignment.staffPersonId]).toContainEqual({ kind: 'appointment', staffId: assignment.staffPersonId, teamId: assignment.teamId, roleId: assignment.role, date: assignment.assignedOn, reason: 'initialAppointment' })
    expect(Object.values(repaired.staffContractsById).filter((contract) => contract.staffId === assignment.staffPersonId && contract.termination === undefined)).toHaveLength(1)
    expect(repeated.staffEmploymentByStaffId).toEqual(repaired.staffEmploymentByStaffId)
    expect(repeated.staffCareerHistoryByStaffId).toEqual(repaired.staffCareerHistoryByStaffId)
    expect(repeated.staffContractsById).toEqual(repaired.staffContractsById)
    expect(getEligibleResponsibilityCandidates(repaired, assignment.teamId, 'createTeamTrainingPlan', 'delegated').map((candidate) => candidate.staffPersonId)).toContain(assignment.staffPersonId)
  })

  it('rejects a conflicting active Staff employment record instead of replacing it during load repair', () => {
    const world = worldWithAssistantCoach()
    const assignment = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === selection.teamId && item.role === 'assistantCoach')!
    const saved = structuredClone(serializeGameWorldV4(world, '2026-09-01T00:00:00.000Z'))
    const runtime = (saved.payload as unknown as Record<string, unknown>).staffCareerRuntime as Record<string, unknown>
    runtime.staffEmployment = [{ staffId: assignment.staffPersonId, employment: { status: 'employed', teamId: 'team:ESP:male:001', roleId: assignment.role, startedOn: assignment.assignedOn } }]
    runtime.staffCareerHistory = []
    runtime.staffContracts = []
    runtime.staffReputationProfiles = []

    expect(() => deserializeGameWorldV4(saved)).toThrow(`Staff ${assignment.staffPersonId} employment does not match Team assignment`)
  })

  it('derives the complete 18-team home-and-away schedule when persisted fixtures are absent', async () => { const session = openSession(); await session.open(); const world = await session.bootstrapGameWorld(selection); expect(Object.keys(world.teams)).toHaveLength(18); expect(Object.keys(world.players)).toHaveLength(90); expect(Object.keys(world.staffPeopleById)).toHaveLength(18); expect(Object.keys(world.teamStaffAssignmentsById)).toHaveLength(18); expect(Object.keys(world.games)).toHaveLength(306); expect(world.organizationKnowledge).toEqual([]); expect(world).not.toHaveProperty('playerKnowledgeById'); expect(Object.values(world.teams).find((team) => team.id === selection.teamId)?.coachId).toBe('worlddb:coach:team:ESP:male:000'); expect(Object.values(world.coaches).find((coach) => coach.id === 'worlddb:coach:team:ESP:male:000')?.firstName).toBe('Head'); expect(Object.values(world.personsById).find((person) => person.id === `${selection.teamId}:head-coach`)?.profileRefs).toEqual([{ kind: 'staff', profileId: 'staff:team:ESP:male:000:head' }]) })
  it('projects no canonical Place or Facility from the canonical World DB slice', async () => {
    // MX0.6 closure audit: the World DB carries `organization.primary_place_id` and `match.facility_id`
    // references, but the canonical bootstrap projects neither a `places` nor a `facilities` collection
    // (and the Rust read-side has no facility projection), so a Spain ACB career starts with zero
    // canonical infrastructure. Facilities gameplay is unreachable until an approved milestone adds
    // that projection/generation authority.
    const session = openSession()
    await session.open()
    const world = await session.bootstrapGameWorld(selection)
    expect(Object.keys(world.placesById)).toEqual([])
    expect(Object.keys(world.facilitiesById)).toEqual([])
    expect(Object.keys(world.facilityComponentsById)).toEqual([])
    expect(Object.keys(world.facilityDevelopmentProjectsById)).toEqual([])
    // The slice itself does carry canonical place references for those organizations: the data exists
    // upstream, only the projection is missing.
    expect(Object.values(world.organizationsById).filter((organization) => organization.primaryPlaceId !== null).length).toBeGreaterThan(0)
  })

  it('preserves shared organization identity, section records and their IDs through save/load', () => {
    const sourceSlice = slice()
    const world = bootstrapGameWorldFromWorldDb(sourceSlice, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema })
    const first = Object.values(world.teams)[0]!
    const second = Object.values(world.teams)[1]!
    expect(first.organizationId).toBe(second.organizationId)
    expect(first.organizationId).toBe('organization:0')
    expect(world.organizationKnowledge).toEqual([])
    expect(world).not.toHaveProperty('playerKnowledgeById')
    expect(world.organizationsById[first.organizationId]?.legalName).toBe('Legal organization:0')
    expect(world.organizationSectionsById[second.organizationSectionId]?.canonicalName).toBe('Team 1')
    expect(world.organizationOwnershipById['ownership:worlddb' as never]?.owner).toEqual({ kind: 'PERSON', personId: 'person:owner-only' })
    expect(world.personsById['person:owner-only' as never]?.profileRefs).toEqual([])
    expect(world.organizationsById['organization:holding' as never]?.legalName).toBe('Holding Organization')
    const restored = deserializeGameWorldV4(serializeGameWorldV4(world, '2026-09-01T00:00:00.000Z'))
    expect(restored.teams[second.id]?.organizationId).toBe(first.organizationId)
    expect(restored.organizationSectionsById[second.organizationSectionId]?.organizationId).toBe(first.organizationId)
    expect(restored.organizationsById[first.organizationId]).toEqual(world.organizationsById[first.organizationId])
  })
  it('loads person and organization investor interests with identity closure but no ownership/control effects', () => {
    const sourceSlice = slice()
    const targetOrganizationId = sourceSlice.teams[0]!.organizationId
    const investorPerson = { personId: 'person:interested-only', firstName: 'Interested', lastName: 'Only', nationalityIds: [] as readonly string[] }
    const interestedSlice = {
      ...sourceSlice,
      persons: [...sourceSlice.persons, investorPerson],
      organizationInvestorInterest: [
        { interestId: 'interest:person', organizationId: targetOrganizationId, investorKind: 'PERSON' as const, investorId: investorPerson.personId, interestType: 'ACQUISITION', status: 'OPEN', openedOn: '2025-10-01', closedOn: null },
        { interestId: 'interest:organization', organizationId: targetOrganizationId, investorKind: 'ORGANIZATION' as const, investorId: 'organization:holding', interestType: 'PARTNERSHIP', status: null, openedOn: null, closedOn: null },
      ],
    }
    const world = bootstrapGameWorldFromWorldDb(interestedSlice, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema })
    expect(Object.keys(world.organizationInvestorInterestsById)).toEqual(['interest:person', 'interest:organization'])
    expect(world.personsById['person:interested-only' as never]?.profileRefs).toEqual([])
    expect(world.organizationsById['organization:holding' as never]?.legalName).toBe('Holding Organization')
    expect(Object.keys(world.organizationOwnershipById)).toEqual(['ownership:worlddb'])
    expect(Object.keys(world.organizationControlById)).toEqual([])
  })
  it('rejects a team whose organization does not own its referenced section', () => {
    const sourceSlice = slice()
    const invalidSlice = { ...sourceSlice, teams: sourceSlice.teams.map((team, index) => index === 1 ? { ...team, organizationId: 'organization:2' } : team) }
    expect(() => bootstrapGameWorldFromWorldDb(invalidSlice, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema })).toThrow(/organization relation is invalid/)
  })
  it('builds 34 valid ACB rounds through the Season end and keeps them after save/load', () => {
    const sourceSlice = slice()
    const world = bootstrapGameWorldFromWorldDb(sourceSlice, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema }, undefined, SPAIN_ACB_2025_26_CALENDAR)
    const games = Object.values(world.games)
    const gamesByDate = new Map<string, typeof games>()
    const gamesByPair = new Map<string, typeof games>()
    for (const game of games) {
      gamesByDate.set(game.date, [...(gamesByDate.get(game.date) ?? []), game])
      const pairKey = [game.homeTeamId, game.awayTeamId].sort().join(':')
      gamesByPair.set(pairKey, [...(gamesByPair.get(pairKey) ?? []), game])
    }

    expect(games).toHaveLength(306)
    expect(gamesByDate.size).toBe(34)
    expect([...gamesByDate.values()].every((round) => round.length === 9)).toBe(true)
    for (const round of gamesByDate.values()) {
      expect(new Set(round.flatMap((game) => [game.homeTeamId, game.awayTeamId])).size).toBe(18)
    }
    expect(gamesByPair.size).toBe(153)
    for (const pair of gamesByPair.values()) {
      expect(pair).toHaveLength(2)
      expect(pair[0]!.homeTeamId).toBe(pair[1]!.awayTeamId)
      expect(pair[0]!.awayTeamId).toBe(pair[1]!.homeTeamId)
    }
    expect(new Set(games.map((game) => game.id)).size).toBe(306)
    expect(games.every((game) => game.date >= sourceSlice.season.startDate && game.date <= sourceSlice.season.endDate)).toBe(true)
    expect(games.some((game) => game.date.startsWith('2026-03-'))).toBe(true)
    expect(games.some((game) => game.date.startsWith('2026-04-'))).toBe(true)
    expect(games.some((game) => game.date > '2026-02-10')).toBe(true)
    expect(games.map((game) => game.date).sort()[0]).toBe('2025-10-04')
    expect(games.map((game) => game.date).sort().at(-1)).toBe('2026-05-30')

    const saved = serializeGameWorldV4(world, '2026-09-01T00:00:00.000Z')
    const restored = deserializeGameWorldV4(saved)
    expect(Object.values(restored.games)).toEqual(games)
  })
  it('uses generated fixtures when the real source contains only a partial schedule', () => {
    const sourceSlice = slice()
    const realFixture = { matchId: 'match:official:1', scheduledAt: '2025-11-02T18:00:00Z', playedAt: null, status: 'SCHEDULED', homeTeamId: sourceSlice.teams[0]!.teamId, awayTeamId: sourceSlice.teams[1]!.teamId }
    const world = bootstrapGameWorldFromWorldDb({ ...sourceSlice, matches: [realFixture] }, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema }, undefined, SPAIN_ACB_2025_26_CALENDAR)

    expect(Object.keys(world.games)).toHaveLength(306)
    expect(Object.values(world.games).some((game) => game.id === realFixture.matchId)).toBe(false)
    expect(new Set(Object.values(world.games).map((game) => game.date)).size).toBe(34)
  })
  it('can advance from February when a later-season game remains scheduled', () => {
    const sourceSlice = slice()
    const fullWorld = bootstrapGameWorldFromWorldDb(sourceSlice, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema })
    const marchGame = Object.values(fullWorld.games).find((game) => game.date >= '2026-03-01')!
    const februaryWorld = createGameWorld({
      currentDate: parseGameDate('2026-02-28'),
      currentSeasonId: fullWorld.currentSeasonId,
      userCoachId: fullWorld.userCoachId,
      countries: Object.values(fullWorld.countries),
      coaches: Object.values(fullWorld.coaches),
      players: Object.values(fullWorld.players),
      teams: Object.values(fullWorld.teams),
      staffPeople: Object.values(fullWorld.staffPeopleById),
      teamStaffAssignments: Object.values(fullWorld.teamStaffAssignmentsById),
      competitions: Object.values(fullWorld.competitions),
      ecosystems: Object.values(fullWorld.ecosystems),
      seasons: Object.values(fullWorld.seasons),
      games: [marchGame!],
    })

    const advanced = advanceGameDay(februaryWorld)
    expect(advanced.currentDate).toBe('2026-03-01')
    expect(advanced.games[marchGame!.id]).toBeDefined()
  })
  it('is deterministic and preserves every canonical 80/40 truth key and value', () => { const sourceSlice = slice(); const pin = { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema }; const first = bootstrapGameWorldFromWorldDb(sourceSlice, selection, pin); const second = bootstrapGameWorldFromWorldDb(sourceSlice, selection, pin); expect(JSON.stringify(first)).toBe(JSON.stringify(second)); for (const sourcePlayer of sourceSlice.players) { const player = first.players[sourcePlayer.playerId as never]!; expect(Object.keys(player.basketball.ratings)).toEqual(PLAYER_TRUTH_RATING_KEYS); expect(PLAYER_TRUTH_RATING_KEYS.map((key) => player.basketball.ratings[key])).toEqual(PLAYER_TRUTH_RATING_KEYS.map((key) => sourcePlayer.ratings[key])); expect(Object.keys(player.basketball.tendencies)).toEqual(PLAYER_TRUTH_TENDENCY_KEYS) } })
  it('rejects a World DB slice with a missing canonical rating', () => { const malformed = slice(); const player = malformed.players[0]!; const { [PLAYER_TRUTH_RATING_KEYS[0]!]: _missing, ...ratings } = player.ratings; expect(() => bootstrapGameWorldFromWorldDb({ ...malformed, players: malformed.players.map((candidate) => candidate.playerId === player.playerId ? { ...candidate, ratings } : candidate) }, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema })).toThrow('exactly 80 canonical keys') })
  it('rejects a selected team outside the B02 slice', async () => { const session = openSession(); await session.open(); await expect(session.bootstrapGameWorld({ ...selection, teamId: 'team:ESP:male:missing' })).rejects.toThrow('not in ecosystem') })

  it('plays RealWorldSpain through ranked ACB playoffs, crowns a champion and survives save/load', () => {
    const worldCompetitionFormat = leagueFormat()
    const sourceSlice = slice()
    const baseWorld = bootstrapGameWorldFromWorldDb(sourceSlice, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema }, worldCompetitionFormat, SPAIN_ACB_2025_26_CALENDAR)
    const season = baseWorld.seasons[baseWorld.currentSeasonId]!
    const regularGames = Object.values(baseWorld.games).filter((game) => game.competitionStageKey === 'REGULAR')
    expect(regularGames).toHaveLength(306)
    expect(Math.max(...regularGames.map((game) => Number(game.date.replaceAll('-', ''))))).toBe(20260530)
    expect(regularGames.some((game) => game.date.startsWith('2026-03-'))).toBe(true)
    expect(regularGames.some((game) => game.date.startsWith('2026-04-'))).toBe(true)
    expect(Object.values(baseWorld.games).some((game) => game.competitionStageKey === 'QUARTERFINALS')).toBe(false)

    const lastRegularGame = [...regularGames].sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id))[0]!
    const almostComplete = updateGameWorld(baseWorld, { games: Object.values(baseWorld.games).map((game) => game.id === lastRegularGame.id ? game : game.competitionStageKey === 'REGULAR' ? createGame({ ...game, status: 'completed', result: { homeScore: 100, awayScore: 80 } }) : game) })
    const afterRegularSeason = applyMatchResult(almostComplete, { gameId: lastRegularGame.id, homeTeamId: lastRegularGame.homeTeamId, awayTeamId: lastRegularGame.awayTeamId, homeScore: 100, awayScore: 80 })
    const regularStandings = calculateStandings(afterRegularSeason, season.id)
    const initialPostseason = getCompetitionPostseasonState(afterRegularSeason, season.id)!
    expect(getCompetitionPostseasonState(afterRegularSeason, season.id)).toEqual(initialPostseason)
    expect(initialPostseason.seeds).toHaveLength(8)
    expect(initialPostseason.seeds.map((entry) => entry.competitionSeasonEntryId)).toEqual(regularStandings.slice(0, 8).map((line) => line.teamId))
    expect(Object.values(afterRegularSeason.games).filter((game) => game.competitionStageKey === 'QUARTERFINALS')).toHaveLength(4)
    expect(Object.values(afterRegularSeason.games).filter((game) => game.competitionStageKey === 'QUARTERFINALS').every((game) => game.date === '2026-06-02')).toBe(true)
    expect(calculateStandings(afterRegularSeason, season.id)).toEqual(regularStandings)
    const idempotentPostseason = materializeCompetitionPostseason(afterRegularSeason, season.id)
    expect(Object.keys(idempotentPostseason.games)).toHaveLength(Object.keys(afterRegularSeason.games).length)

    const firstPostseasonGame = Object.values(afterRegularSeason.games).find((game) => game.competitionStageKey === 'QUARTERFINALS')!
    const afterOnePlayoffResult = applyMatchResult(afterRegularSeason, { gameId: firstPostseasonGame.id, homeTeamId: firstPostseasonGame.homeTeamId, awayTeamId: firstPostseasonGame.awayTeamId, homeScore: 100, awayScore: 80 })
    const savedMidSeries = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(afterOnePlayoffResult, '2026-09-01T00:00:00.000Z'))))
    expect(Object.values(savedMidSeries.games)).toHaveLength(Object.values(afterOnePlayoffResult.games).length)
    expect(getCompetitionPostseasonState(savedMidSeries, season.id)).toEqual(getCompetitionPostseasonState(afterOnePlayoffResult, season.id))

    let playoffWorld = savedMidSeries
    for (let step = 0; step < 27; step += 1) {
      const next = Object.values(playoffWorld.games).filter((game) => game.competitionStageKey !== 'REGULAR' && game.status === 'scheduled').sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))[0]
      if (next === undefined) break
      playoffWorld = applyMatchResult(playoffWorld, { gameId: next.id, homeTeamId: next.homeTeamId, awayTeamId: next.awayTeamId, homeScore: 100, awayScore: 80 })
    }

    const postseasonGames = Object.values(playoffWorld.games).filter((game) => game.competitionStageKey !== 'REGULAR')
    expect(postseasonGames.filter((game) => game.competitionStageKey === 'QUARTERFINALS')).toHaveLength(12)
    expect(postseasonGames.filter((game) => game.competitionStageKey === 'SEMIFINALS')).toHaveLength(10)
    expect(postseasonGames.filter((game) => game.competitionStageKey === 'FINAL')).toHaveLength(5)
    expect(postseasonGames.every((game) => game.status === 'completed')).toBe(true)
    expect(postseasonGames.every((game) => game.date >= '2026-06-02' && game.date <= '2026-06-28')).toBe(true)
    const completedPostseason = getCompetitionPostseasonState(playoffWorld, season.id)!
    const finalSeries = Object.values(completedPostseason.seriesByFixtureId).find((series) => series.plan.nodeKey === 'FINAL')!
    expect(Object.values(completedPostseason.seriesByFixtureId).filter((series) => series.plan.nodeKey === 'QUARTERFINALS').every((series) => series.plan.bestOf === 3 && series.plan.winsRequired === 2)).toBe(true)
    expect(Object.values(completedPostseason.seriesByFixtureId).filter((series) => series.plan.nodeKey === 'SEMIFINALS').every((series) => series.plan.bestOf === 5 && series.plan.winsRequired === 3)).toBe(true)
    expect(finalSeries.plan.bestOf).toBe(5)
    expect(finalSeries.plan.winsRequired).toBe(3)
    expect(new Set(Object.values(playoffWorld.games).map((game) => game.id)).size).toBe(Object.values(playoffWorld.games).length)
    expect(getCompetitionPostseasonState(playoffWorld, season.id)?.championTeamId).toBe(finalSeries.state.winnerEntryId)
    expect(isSeasonComplete(playoffWorld, season.id)).toBe(true)

    const completed = finalizeCompletedSeason(playoffWorld, season.id)
    const history = completed.seasonHistoryBySeasonId[season.id]!
    expect(history.championTeamId).toBe(completedPostseason.championTeamId)
    expect(history.championSource).toBe('postseason')
    expect(history.finalStandings).toEqual(regularStandings)
    expect(calculateStandings(completed, season.id)).toEqual(regularStandings)
    expect(completed.worldDbCompetitionRuntime?.competitionSeasonIds).toEqual([])
    const savedChampion = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(completed, '2026-09-01T00:00:00.000Z'))))
    expect(Object.values(savedChampion.games)).toEqual(Object.values(completed.games))
    expect(savedChampion.seasonHistoryBySeasonId[season.id]).toEqual(history)
    expect(getCompetitionPostseasonState(savedChampion, season.id)).toEqual(getCompetitionPostseasonState(completed, season.id))
  })

  it('runs the RealWorldSpain league, linked Cup, playoffs, clock and next edition lifecycle', async () => {
    const sourceSlice = slice()
    const leagueSeasonId = sourceSlice.season.seasonId as never
    let world = await createWorldDbSpainGame(selection.teamId, {
      repository: repository(sourceSlice),
      databasePath: source.databaseId,
      runtimeBundlePath: 'runtime-bundle.json',
    })
    const leagueSeason = world.seasons[leagueSeasonId]!
    const cupSeasonId = Object.values(world.seasons).find((season) => season.worldCompetitionFormat?.competitionSeasonId === spainCopaCompetitionSeasonId(2025))!.id
    const regularGames = Object.values(world.games).filter((game) => game.seasonId === leagueSeasonId && game.competitionStageKey === 'REGULAR')
    const rounds = [...new Set(regularGames.map((game) => game.date))].sort()

    expect(rounds).toHaveLength(34)
    expect(regularGames).toHaveLength(306)
    expect(regularGames.map((game) => game.date).sort()[0]).toBe('2025-10-04')
    expect(rounds[16]).toBe('2026-01-24')
    expect(rounds[33]).toBe('2026-05-30')
    expect(Object.values(world.games).filter((game) => game.seasonId === cupSeasonId)).toHaveLength(0)

    const first17 = regularGames.filter((game) => game.date <= rounds[16]!)
    world = completeGames(world, first17.slice(0, -1))
    const incompleteCupEligibility = getCompetitionPostseasonState(world, cupSeasonId)!
    expect(incompleteCupEligibility.regularSeasonComplete).toBe(false)
    const finalJ17Game = first17.at(-1)!
    world = applyMatchResult(world, { gameId: finalJ17Game.id, homeTeamId: finalJ17Game.homeTeamId, awayTeamId: finalJ17Game.awayTeamId, homeScore: 100, awayScore: 80 })

    const cupSeasonAfterQualification = world.seasons[cupSeasonId]!
    const firstHalfStandings = calculateStandings(world, leagueSeasonId, rounds[16])
    expect(cupSeasonAfterQualification.participantTeamIds).toHaveLength(8)
    expect(cupSeasonAfterQualification.participantTeamIds).toEqual(firstHalfStandings.slice(0, 8).map((line) => line.teamId))
    expect(Object.values(world.games).filter((game) => game.seasonId === cupSeasonId && game.competitionStageKey === 'QUARTERFINALS')).toHaveLength(4)
    expect(Object.values(world.games).filter((game) => game.seasonId === cupSeasonId).every((game) => game.neutralSite === true)).toBe(true)
    expect(Object.values(world.games).filter((game) => game.seasonId === leagueSeasonId && game.competitionStageKey === 'REGULAR')).toHaveLength(306)

    const savedCupQualification = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, '2026-09-01T00:00:00.000Z'))))
    expect(savedCupQualification.seasons[cupSeasonId]?.worldCompetitionFormat?.competitionSeasonId).toBe(spainCopaCompetitionSeasonId(2025))
    expect(Object.values(savedCupQualification.games).filter((game) => game.seasonId === cupSeasonId)).toHaveLength(4)
    expect(Object.values(savedCupQualification.games).filter((game) => game.seasonId === cupSeasonId).every((game) => game.neutralSite === true)).toBe(true)

    for (const stage of ['QUARTERFINALS', 'SEMIFINALS', 'FINAL']) {
      const stageGames = Object.values(world.games).filter((game) => game.seasonId === cupSeasonId && game.competitionStageKey === stage && game.status === 'scheduled')
      world = completeGamesWithTrigger(world, stageGames)
    }
    const cupState = getCompetitionPostseasonState(world, cupSeasonId)!
    const cupChampion = cupState.championTeamId!
    expect(cupChampion).toBeDefined()
    expect(isSeasonComplete(world, cupSeasonId)).toBe(true)
    expect(Object.values(world.games).filter((game) => game.seasonId === cupSeasonId)).toHaveLength(7)
    world = finalizeCompletedSeason(world, cupSeasonId)
    expect(world.seasonHistoryBySeasonId[cupSeasonId]?.championTeamId).toBe(cupChampion)
    const priorCupSeason = structuredClone(world.seasons[cupSeasonId])
    const priorCupGames = structuredClone(Object.values(world.games).filter((game) => game.seasonId === cupSeasonId))
    const priorCupHistory = structuredClone(world.seasonHistoryBySeasonId[cupSeasonId])

    const after33 = completeGames(world, regularGames.filter((game) => game.date <= rounds[32]!))
    expect(Object.values(after33.games).filter((game) => game.seasonId === leagueSeasonId && game.competitionStageKey === 'REGULAR' && game.status === 'completed')).toHaveLength(297)
    expect(getCompetitionPostseasonState(after33, leagueSeasonId)?.regularSeasonComplete).toBe(false)
    expect(Object.values(after33.games).some((game) => game.seasonId === leagueSeasonId && game.competitionStageKey === 'QUARTERFINALS')).toBe(false)

    const leagueGamesThroughJ33AndPartOfJ34 = regularGames.filter((game) => game.date <= rounds[33]!).slice(0, -1)
    world = completeGames(world, leagueGamesThroughJ33AndPartOfJ34)
    const lastRegularGame = regularGames.find((game) => game.id === regularGames.at(-1)!.id)!
    world = applyMatchResult(world, { gameId: lastRegularGame.id, homeTeamId: lastRegularGame.homeTeamId, awayTeamId: lastRegularGame.awayTeamId, homeScore: 100, awayScore: 80 })
    const finalStandings = calculateStandings(world, leagueSeasonId)
    const playoffState = getCompetitionPostseasonState(world, leagueSeasonId)!
    expect(playoffState.regularSeasonComplete).toBe(true)
    expect(playoffState.seeds.map((entry) => entry.competitionSeasonEntryId)).toEqual(finalStandings.slice(0, 8).map((line) => line.teamId))
    expect(Object.values(world.games).filter((game) => game.seasonId === leagueSeasonId && game.competitionStageKey === 'REGULAR' && game.status === 'completed')).toHaveLength(306)
    expect(Object.values(world.games).filter((game) => game.seasonId === leagueSeasonId && game.competitionStageKey === 'QUARTERFINALS')).toHaveLength(4)

    const savedPlayoffs = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, '2026-09-01T00:00:00.000Z'))))
    expect(getCompetitionPostseasonState(savedPlayoffs, leagueSeasonId)?.seeds).toEqual(playoffState.seeds)
    expect(Object.values(savedPlayoffs.games).filter((game) => game.seasonId === leagueSeasonId && game.competitionStageKey === 'QUARTERFINALS')).toHaveLength(4)
    world = savedPlayoffs

    for (const stage of ['QUARTERFINALS', 'SEMIFINALS', 'FINAL']) {
      const fixtureIds = [...new Set(Object.values(world.games).filter((game) => game.seasonId === leagueSeasonId && game.competitionStageKey === stage).map((game) => game.postseasonFixtureId!))]
      for (const fixtureId of fixtureIds) {
        while (true) {
          const next = Object.values(world.games).find((game) => game.seasonId === leagueSeasonId && game.postseasonFixtureId === fixtureId && game.status === 'scheduled')
          if (next === undefined) break
          world = applyMatchResult(world, { gameId: next.id, homeTeamId: next.homeTeamId, awayTeamId: next.awayTeamId, homeScore: 100, awayScore: 80 })
        }
      }
    }

    const completedPlayoffs = Object.values(world.games).filter((game) => game.seasonId === leagueSeasonId && game.competitionStageKey !== 'REGULAR')
    const leagueChampion = getCompetitionPostseasonState(world, leagueSeasonId)!.championTeamId!
    expect(completedPlayoffs).toHaveLength(27)
    expect(completedPlayoffs.every((game) => game.status === 'completed' && game.date >= '2026-06-02' && game.date <= '2026-06-28')).toBe(true)
    expect(new Set(Object.values(world.games).map((game) => game.id)).size).toBe(Object.values(world.games).length)
    expect(isSeasonComplete(world, leagueSeasonId)).toBe(true)
    world = finalizeCompletedSeason(world, leagueSeasonId)
    expect(world.seasonHistoryBySeasonId[leagueSeasonId]?.championTeamId).toBe(leagueChampion)

    const atFinalWindow = updateGameWorld(world, { currentDate: parseGameDate('2026-06-28') })
    const atJuly1 = updateGameWorld(atFinalWindow, { currentDate: parseGameDate('2026-07-01') })
    expect(atJuly1.currentDate).toBe('2026-07-01')

    // Rollover never moves the world clock or currentSeasonId (see startNextSeason.ts): the new
    // edition is located by competitionId, not by re-reading currentSeasonId.
    const nextSeasonWorld = startNextSeason(atJuly1)
    expect(nextSeasonWorld.currentDate).toBe(atJuly1.currentDate)
    expect(nextSeasonWorld.currentSeasonId).toBe(atJuly1.currentSeasonId)
    const leagueCompetitionId = atJuly1.seasons[leagueSeasonId]!.competitionId
    const nextLeague = Object.values(nextSeasonWorld.seasons).find((season) => season.competitionId === leagueCompetitionId && season.id !== leagueSeasonId)!
    const nextLeagueGames = Object.values(nextSeasonWorld.games).filter((game) => game.seasonId === nextLeague.id && game.competitionStageKey === 'REGULAR')
    const nextCup = Object.values(nextSeasonWorld.seasons).find((season) => season.worldCompetitionFormat?.competitionSeasonId === spainCopaCompetitionSeasonId(2026))
    expect(nextLeague.worldCompetitionFormat?.competitionSeasonId).toBe('edition:ESP:liga-endesa:2026-27')
    expect(nextLeagueGames).toHaveLength(306)
    expect(new Set(nextLeagueGames.map((game) => game.date)).size).toBe(34)
    expect(nextCup).toBeDefined()
    expect(nextCup?.calendarPolicy?.seasonWindow.startDate).toBe('2027-02-19')
    expect(nextLeague.calendarPolicy?.seasonWindow.startDate).toBe('2026-10-01')
    expect(nextCup?.participantTeamIds).toEqual([])
    expect(Object.values(nextSeasonWorld.games).filter((game) => game.seasonId === nextCup?.id)).toHaveLength(0)
    expect(getCompetitionPostseasonState(nextSeasonWorld, nextCup!.id)?.lifecycleDiagnostic?.code).toBe('QUALIFICATION_PENDING')

    const seasonCountAfterFirstRollover = Object.keys(nextSeasonWorld.seasons).length
    const repeatedRollover = startNextSeasonFor(nextSeasonWorld, leagueSeasonId)
    expect(repeatedRollover).toBe(nextSeasonWorld)
    expect(Object.keys(repeatedRollover.seasons)).toHaveLength(seasonCountAfterFirstRollover)
    expect(Object.values(repeatedRollover.seasons).filter((season) => season.worldCompetitionFormat?.competitionSeasonId === spainCopaCompetitionSeasonId(2026))).toHaveLength(1)

    const nextLeagueRounds = [...new Set(nextLeagueGames.map((game) => game.date))].sort()
    const nextLeagueFirst17 = nextLeagueGames.filter((game) => game.date <= nextLeagueRounds[16]!)
    let afterNextCupQualification = completeGames(repeatedRollover, nextLeagueFirst17.slice(0, -1))
    const finalNextLeagueJ17Game = nextLeagueFirst17.at(-1)!
    afterNextCupQualification = applyMatchResult(afterNextCupQualification, { gameId: finalNextLeagueJ17Game.id, homeTeamId: finalNextLeagueJ17Game.homeTeamId, awayTeamId: finalNextLeagueJ17Game.awayTeamId, homeScore: 100, awayScore: 80 })
    const playableNextCup = afterNextCupQualification.seasons[nextCup!.id]!
    const nextCupState = getCompetitionPostseasonState(afterNextCupQualification, nextCup!.id)!
    const expectedNextCupParticipants = calculateStandings(afterNextCupQualification, nextLeague.id, nextLeagueRounds[16]).slice(0, 8).map((line) => line.teamId)
    const nextCupGames = Object.values(afterNextCupQualification.games).filter((game) => game.seasonId === nextCup!.id)
    expect(playableNextCup.participantTeamIds).toEqual(expectedNextCupParticipants)
    expect(nextCupState.seeds.map((entry) => entry.competitionSeasonEntryId)).toEqual(expectedNextCupParticipants)
    expect(nextCupState.bracketPlan?.fixtures).toHaveLength(7)
    expect(nextCupGames).toHaveLength(4)
    expect(nextCupGames.every((game) => game.seasonId === nextCup!.id && game.date === '2027-02-19' && game.neutralSite === true)).toBe(true)
    expect(nextCupGames.every((game) => !priorCupGames.some((prior) => prior.id === game.id))).toBe(true)
    expect(afterNextCupQualification.seasons[cupSeasonId]).toEqual(priorCupSeason)
    expect(Object.values(afterNextCupQualification.games).filter((game) => game.seasonId === cupSeasonId)).toEqual(priorCupGames)
    expect(afterNextCupQualification.seasonHistoryBySeasonId[cupSeasonId]).toEqual(priorCupHistory)

    const cupSeason = afterNextCupQualification.seasons[nextCup!.id]!
    const invalidFormat = {
      ...cupSeason.worldCompetitionFormat!,
      variants: cupSeason.worldCompetitionFormat!.variants.map((variant) => variant.key === 'MAIN' ? {
        ...variant,
        entrySelection: { ...variant.entrySelection!, payload: { ...variant.entrySelection!.payload, source_competition_season_id: 'missing:league:edition' } },
      } : variant),
    }
    const invalidWorld = updateGameWorld(afterNextCupQualification, { seasons: [...Object.values(afterNextCupQualification.seasons).map((season) => season.id === cupSeason.id ? { ...season, worldCompetitionFormat: invalidFormat } : season)] })
    const invalidCupState = getCompetitionPostseasonState(invalidWorld, cupSeason.id)!
    expect(invalidCupState.regularSeasonComplete).toBe(false)
    expect(invalidCupState.bracketPlan).toBeNull()
    expect(invalidCupState.lifecycleDiagnostic).toEqual({ code: 'INVALID_QUALIFICATION', message: 'Configured qualification source season is missing: missing:league:edition', sourceCompetitionSeasonId: 'missing:league:edition' })
  })

  // RWS-BUG-002A: the calendar's regular-season window is now derived from the actual round
  // count and cadence (deriveNextEditionCalendarPolicy), never a fixed offset copied from the
  // reference 2025-26 edition, so it can no longer run out of margin however the aligned
  // start date's weekday falls across repeated rollovers.
  it.skipIf(process.env.BDM_WORLD_DB_LONGITUDINAL !== '1')('RWS-BUG-002 long run: advances the world clock exactly 1000 calendar days through multiple ACB season rollovers without stopping', async () => {
    const initialWorld = await createWorldDbSpainGame(selection.teamId, {
      repository: repository(slice()),
      databasePath: source.databaseId,
      runtimeBundlePath: 'runtime-bundle.json',
    })
    const startDate = initialWorld.currentDate
    const expectedFinalDate = addDays(startDate, 1000)

    const primaryCompetitionId = initialWorld.seasons[initialWorld.currentSeasonId]!.competitionId

    const evidence = createLongitudinalEvidence(initialWorld, expectedFinalDate, { slice: slice(), selection, runtimeBundle }, 151617, 'advanceGameDay loop with explicit supported rollover')
    let world = initialWorld
    let seasonsCreated = 0
    let postseasonsCreated = 0
    let gamesCompletedTotal = 0
    // Rollover NEVER moves currentDate/currentSeasonId (see startNextSeason.ts): a Season, once
    // rolled, must never be handed to startNextSeasonFor again -- track which ones already have a
    // next edition so the world clock's own day-by-day walk is the only thing driving progress,
    // exactly as CalendarEngine.migrateCurrentSeasonIfElapsed will once currentDate reaches it.
    const rolledSeasonIds = new Set<string>()
    const seasonIdsSeen = new Set<string>([world.currentSeasonId as string])

    try {
      let safety = 0
      while (world.currentDate < expectedFinalDate) {
        safety += 1
        if (safety > 5000) throw new Error('Long-run safety limit exceeded before reaching the expected final date')
        const beforePostseasonGames = Object.values(world.games).filter((game) => game.competitionStageKey !== 'REGULAR').length
        const beforeCompletedGames = Object.values(world.games).filter((game) => game.status === 'completed').length

        world = advanceGameDay(world, evidence.createSeed, ['userGame'], evidence.onDayAdvance)

        const afterCompletedGames = Object.values(world.games).filter((game) => game.status === 'completed').length
        gamesCompletedTotal += afterCompletedGames - beforeCompletedGames
        const afterPostseasonGames = Object.values(world.games).filter((game) => game.competitionStageKey !== 'REGULAR').length
        if (afterPostseasonGames > beforePostseasonGames) postseasonsCreated += 1

        const latestPrimarySeason = Object.values(world.seasons)
          .filter((season) => season.competitionId === primaryCompetitionId)
          .sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0))[0]!
        if (!rolledSeasonIds.has(latestPrimarySeason.id) && isSeasonComplete(world, latestPrimarySeason.id) && world.seasonHistoryBySeasonId[latestPrimarySeason.id] !== undefined) {
          world = startNextSeasonFor(world, latestPrimarySeason.id)
          evidence.observeWorld(world, 'EXPLICIT_FIXTURE_ROLLOVER', { command: 'startNextSeasonFor', seasonId: latestPrimarySeason.id })
          rolledSeasonIds.add(latestPrimarySeason.id)
          seasonsCreated += 1
          const newest = Object.values(world.seasons)
            .filter((season) => season.competitionId === primaryCompetitionId)
            .sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0))[0]!
          seasonIdsSeen.add(newest.id)
        }
      }

      expect(world.currentDate).toBe(expectedFinalDate)
      expect(seasonsCreated).toBeGreaterThanOrEqual(1)
      expect(postseasonsCreated).toBeGreaterThanOrEqual(1)
      expect(gamesCompletedTotal).toBeGreaterThan(306)

      // No duplicated CompetitionSeasons: every rollover produced a distinct Season identity.
      expect(seasonIdsSeen.size).toBe(seasonsCreated + 1)
      // No duplicated Games: canonical Game IDs remain unique across the whole run.
      expect(new Set(Object.values(world.games).map((game) => game.id)).size).toBe(Object.values(world.games).length)
      evidence.finish({ world, finalDate: world.currentDate, daysAdvanced: 1000, stopReason: { type: 'arrived' }, seasonTransitions: [] })
    } catch (error) {
      evidence.fail(error)
      throw error
    }
  }, 120_000)

  it.skipIf(process.env.BDM_WORLD_DB_LONGITUDINAL !== '1')('RWS-BUG-002 ten-year run: reaches 2035-10-01 through canonical simulation, rollovers, and annual development', async () => {
    const startDate = parseGameDate('2025-10-01')
    const targetDate = parseGameDate('2035-10-01')
    const initialWorld = await createWorldDbSpainGame(selection.teamId, {
      repository: repository(slice()),
      databasePath: source.databaseId,
      runtimeBundlePath: 'runtime-bundle.json',
    })
    expect(initialWorld.currentDate).toBe(startDate)
    const expectedCycleIds = expectedAnnualDevelopmentCycleIds(startDate, targetDate)
    const deterministicCycleContext = {
      fromSeasonId: initialWorld.currentSeasonId,
      toSeasonId: initialWorld.currentSeasonId,
      targetDate: startDate,
      cycleId: expectedCycleIds[0]!,
    }
    expect(PlayerDevelopmentEngine.applyOffseasonDevelopment(initialWorld, deterministicCycleContext)).toEqual(
      PlayerDevelopmentEngine.applyOffseasonDevelopment(initialWorld, deterministicCycleContext),
    )

    const advancedDates: string[] = []
    const noGameDates: string[] = []
    const originalAdvanceDay = CalendarEngine.advanceDay
    const advanceDaySpy = vi.spyOn(CalendarEngine, 'advanceDay').mockImplementation((world) => {
      const next = originalAdvanceDay(world)
      advancedDates.push(next.currentDate)
      if (!Object.values(next.games).some((game) => game.status === 'scheduled' && game.date === next.currentDate)) {
        noGameDates.push(next.currentDate)
      }
      return next
    })

    const originalStartNextSeasonFor = SeasonLifecycle.startNextSeasonFor
    const rolloverDates: string[] = []
    const rolloverSpy = vi.spyOn(SeasonLifecycle, 'startNextSeasonFor').mockImplementation((world, seasonId) => {
      const currentDateBeforeRollover = world.currentDate
      const next = originalStartNextSeasonFor(world, seasonId)
      expect(next.currentDate).toBe(currentDateBeforeRollover)
      rolloverDates.push(currentDateBeforeRollover)
      return next
    })

    const observedApplications: { readonly cycleId: string | undefined; readonly date: string }[] = []
    const originalApplyOffseasonDevelopment = PlayerDevelopmentEngine.applyOffseasonDevelopment
    const developmentSpy = vi.spyOn(PlayerDevelopmentEngine, 'applyOffseasonDevelopment').mockImplementation((world, context) => {
      observedApplications.push({ cycleId: context.cycleId, date: world.currentDate })
      return originalApplyOffseasonDevelopment(world, context)
    })

    const evidence = createLongitudinalEvidence(initialWorld, targetDate, { slice: slice(), selection, runtimeBundle }, 151617)
    let result: ReturnType<typeof simulateUntilDate>
    let capturedSpyCalls: { readonly cycleId: string | undefined; readonly date: string }[] = []
    try {
      result = simulateUntilDate(initialWorld, targetDate, evidence.createSeed, { onDayAdvance: evidence.onDayAdvance })
      evidence.finish(result)
      // Capture the spy history while it is still active; mockRestore() clears its call history.
      capturedSpyCalls = developmentSpy.mock.calls.map(([world, context]) => ({ cycleId: context.cycleId, date: world.currentDate }))
    } catch (error) {
      evidence.fail(error)
      throw error
    } finally {
      developmentSpy.mockRestore()
      rolloverSpy.mockRestore()
      advanceDaySpy.mockRestore()
    }

    try {
      process.stdout.write(`[RWS legacy long-run stop] ${JSON.stringify({ finalDate: result!.finalDate, stopReason: result!.stopReason })}\n`)
      const { world } = result!
      const seasons = Object.values(world.seasons)
      const seasonIds = seasons.map((season) => season.id)
      const duplicateSeasonIds = seasonIds.filter((id, index) => seasonIds.indexOf(id) !== index)
      const competitionSeasonIds = seasons.flatMap((season) =>
        season.worldCompetitionFormat === undefined ? [] : [season.worldCompetitionFormat.competitionSeasonId],
      )
      const duplicateCompetitionSeasonIds = competitionSeasonIds.filter((id, index) => competitionSeasonIds.indexOf(id) !== index)
      const games = Object.values(world.games)
      const gameIds = games.map((game) => game.id)
      const duplicateGameIds = gameIds.filter((id, index) => gameIds.indexOf(id) !== index)
      const pendingGamesInPast = games.filter((game) => game.status === 'scheduled' && game.date < world.currentDate)
      const observedCycleIds = observedApplications.map((application) => application.cycleId).filter((id): id is string => id !== undefined)
      const duplicateCycleIds = observedCycleIds.filter((id, index) => observedCycleIds.indexOf(id) !== index)
      const competitionSeasonsCreated = seasons.length - Object.keys(initialWorld.seasons).length

      console.log(JSON.stringify({
        startDate,
        targetDate,
        finalDate: result!.finalDate,
        stopReason: result!.stopReason,
        expectedCycleIds,
        observedCycleIds,
        applications: observedApplications,
        capturedSpyCalls,
        duplicateCycleIds,
        competitionSeasonsCreated,
        competitionSeasonsInWorld: seasons.length,
        pendingGamesInPast: pendingGamesInPast.length,
        duplicateSeasonIds,
        duplicateCompetitionSeasonIds,
        duplicateGameIds,
      }))

      expect(result!.finalDate).toBe(targetDate)
      expect(world.currentDate).toBe(targetDate)
      expect(result!.daysAdvanced).toBe(3652)
      expect(['arrived', 'userGame', 'mediaOpportunity']).toContain(result!.stopReason.type)
      expect(advancedDates.at(-1)).toBe(targetDate)
      expect(noGameDates.length).toBeGreaterThan(0)
      expect(pendingGamesInPast).toHaveLength(0)
      expect(duplicateSeasonIds).toEqual([])
      expect(duplicateCompetitionSeasonIds).toEqual([])
      expect(seasons.every((season) => season.startDate <= season.endDate)).toBe(true)
      for (const competitionId of new Set(seasons.map((season) => season.competitionId))) {
        const editions = seasons
          .filter((season) => season.competitionId === competitionId)
          .sort((left, right) => left.startDate.localeCompare(right.startDate))
        expect(editions.every((season, index) => index === 0 || editions[index - 1]!.endDate < season.startDate)).toBe(true)
      }
      expect(duplicateGameIds).toEqual([])
      expect(rolloverDates.length).toBeGreaterThanOrEqual(10)
      expect(rolloverDates.every((date) => date >= startDate && date < targetDate)).toBe(true)
      expect(capturedSpyCalls).toEqual(observedApplications)
      expect(observedCycleIds).toEqual(expectedCycleIds)
      expect(new Set(observedCycleIds).size).toBe(observedCycleIds.length)
      expect(duplicateCycleIds).toEqual([])
      expect(observedApplications.map((application) => application.date)).toEqual(
        expectedCycleIds.map((cycleId) => `${cycleId.slice('annual-development:'.length)}-07-01`),
      )
      expect(world.worldAnnualDevelopmentCycle?.lastAppliedCycleId).toBe(expectedCycleIds.at(-1))
    } catch (error) {
      evidence.fail(error)
      throw error
    }
  }, 900_000)

  it.each([100, 365])('measures advanceGameDay performance over %i consecutive days', async (dayCount) => {
    let world = await createWorldDbSpainGame(selection.teamId, {
      repository: repository(slice()),
      databasePath: source.databaseId,
      runtimeBundlePath: 'runtime-bundle.json',
    })
    const startedAt = performance.now()
    for (let day = 0; day < dayCount; day += 1) world = advanceGameDay(world)
    const elapsedMs = performance.now() - startedAt
    // eslint-disable-next-line no-console
    console.log(`advanceGameDay x${dayCount}: ${elapsedMs.toFixed(1)}ms (${(elapsedMs / dayCount).toFixed(2)}ms/day)`)
    expect(world.currentDate).toBeDefined()
  }, 60_000)

  it.each([10, 20])('RWS-BUG-002A lifecycle: rolls over %i consecutive ACB seasons without duplicate IDs, dates, or fixtures', async (seasonCount) => {
    let world = await createWorldDbSpainGame(selection.teamId, {
      repository: repository(slice()),
      databasePath: source.databaseId,
      runtimeBundlePath: 'runtime-bundle.json',
    })
    const primaryCompetitionId = world.seasons[world.currentSeasonId]!.competitionId
    const seasonIds = new Set<string>()
    const seasonStartDates: string[] = []
    let previousSeasonEnd = ''
    // Rollover never moves currentSeasonId (see startNextSeason.ts): each edition is located by
    // competitionId + latest startDate, exactly like CalendarEngine's own successor lookup.
    let season = world.seasons[world.currentSeasonId]!

    for (let seasonNumber = 0; seasonNumber < seasonCount; seasonNumber += 1) {
      expect(seasonIds.has(season.id)).toBe(false)
      seasonIds.add(season.id)
      seasonStartDates.push(season.startDate)
      if (previousSeasonEnd !== '') expect(season.startDate > previousSeasonEnd).toBe(true)
      previousSeasonEnd = season.endDate

      const regularGames = Object.values(world.games).filter((game) => game.seasonId === season.id && game.competitionStageKey === 'REGULAR')
      expect(regularGames).toHaveLength(306)
      expect(new Set(regularGames.map((game) => game.date)).size).toBe(34)

      world = completeGamesWithTrigger(world, regularGames)
      let playoffWorld = world
      while (true) {
        const next = Object.values(playoffWorld.games).find((game) => game.seasonId === season.id && game.competitionStageKey !== 'REGULAR' && game.status === 'scheduled')
        if (next === undefined) break
        playoffWorld = applyMatchResult(playoffWorld, { gameId: next.id, homeTeamId: next.homeTeamId, awayTeamId: next.awayTeamId, homeScore: 100, awayScore: 80 })
      }
      world = playoffWorld
      expect(isSeasonComplete(world, season.id)).toBe(true)
      world = finalizeCompletedSeason(world, season.id)
      expect(world.seasonHistoryBySeasonId[season.id]).toBeDefined()

      world = startNextSeasonFor(world, season.id)
      season = Object.values(world.seasons)
        .filter((candidate) => candidate.competitionId === primaryCompetitionId)
        .sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0))[0]!
    }

    // No duplicated CompetitionSeasons/fixtures across the whole run.
    expect(seasonIds.size).toBe(seasonCount)
    expect(new Set(Object.values(world.games).map((game) => game.id)).size).toBe(Object.values(world.games).length)
    // No CompetitionSeason ever reused an absolute date range from the reference 2025-26 edition
    // (season index 0), except that first edition itself.
    expect(new Set(seasonStartDates).size).toBe(seasonCount)
    expect(seasonStartDates.slice(1).every((date) => date !== seasonStartDates[0])).toBe(true)
  }, 300_000)
})

function expectedAnnualDevelopmentCycleIds(startDate: string, targetDate: string): string[] {
  const cycleIds: string[] = []
  const firstYear = Number(startDate.slice(0, 4))
  const lastYear = Number(targetDate.slice(0, 4))
  for (let year = firstYear; year <= lastYear; year += 1) {
    const triggerDate = `${year}-07-01`
    if (triggerDate > startDate && triggerDate <= targetDate) cycleIds.push(`annual-development:${year}`)
  }
  return cycleIds
}

function leagueFormat() {
  return parseWorldCompetitionFormatDocument({
    schema_version: '1.0', competition_id: 'competition:ESP:liga-endesa', competition_season_id: 'edition:ESP:liga-endesa:2025-26', season_label: '2025-26', status: 'COMPLETE',
    variants: [{ key: 'MAIN', is_real_variant: true, nodes: [
      { key: 'REGULAR', node_type: 'STAGE', role: 'REGULAR_SEASON', team_count: 18, pairing: { type: 'ROUND_ROBIN', meetings_per_pair: 2 } },
      { key: 'QUARTERFINALS', node_type: 'ROUND', role: 'PLAYOFF', team_count: 8, pairing: { type: 'FIXED_BRACKET', payload: { matchups: ['1-8', '2-7', '3-6', '4-5'] } }, contest: { format_type: 'SERIES', best_of: 3, wins_required: 2 }, hosting: { rule_type: 'SERIES_PATTERN', pattern: 'HAH', priority_basis: 'HIGHER_SEED', payload: {} } },
      { key: 'SEMIFINALS', node_type: 'ROUND', role: 'PLAYOFF', team_count: 4, pairing: { type: 'FIXED_BRACKET', payload: { paths: ['WINNER_1_VS_8_VS_WINNER_2_VS_7', 'WINNER_3_VS_6_VS_WINNER_4_VS_5'] } }, contest: { format_type: 'SERIES', best_of: 5, wins_required: 3 }, hosting: { rule_type: 'SERIES_PATTERN', pattern: 'HAHAH', priority_basis: 'HIGHER_SEED', payload: {} } },
      { key: 'FINAL', node_type: 'ROUND', role: 'FINAL', team_count: 2, contest: { format_type: 'SERIES', best_of: 5, wins_required: 3 }, hosting: { rule_type: 'SERIES_PATTERN', pattern: 'HAHAH', priority_basis: 'HIGHER_SEED', payload: {} } },
    ], edges: [
      { from: 'REGULAR', to: 'QUARTERFINALS', selector: 'RANK_RANGE', rank_from: 1, rank_to: 8 },
      { from: 'QUARTERFINALS', to: 'SEMIFINALS', selector: 'WINNER' },
      { from: 'SEMIFINALS', to: 'FINAL', selector: 'WINNER' },
    ] }],
    sources: [{ url: 'https://www.acb.com', type: 'OFFICIAL' }],
  })
}

function cupFormat() {
  const seasonId = spainCopaCompetitionSeasonId(2025)
  return parseWorldCompetitionFormatDocument({
    schema_version: '1.0', competition_id: 'competition:ESP:copa-del-rey', competition_season_id: seasonId, season_label: '2025-26', status: 'COMPLETE',
    variants: [{ key: 'MAIN', is_real_variant: true, entry_selection: { method: 'RANK_BASED', payload: { source_competition_season_id: 'edition:ESP:liga-endesa:2025-26', reference_point: 'AFTER_MATCHDAY_17', rank_from: 1, rank_to: 8 } }, seeding: { scheme_type: 'POTS', basis: [] }, nodes: [
      { key: 'QUARTERFINALS', node_type: 'ROUND', role: 'FINAL_EIGHT', team_count: 8, pairing: { type: 'FIXED_BRACKET', payload: { matchups: ['1-8', '2-7', '3-6', '4-5'] } }, contest: { format_type: 'SINGLE_GAME', requires_winner: true }, hosting: { rule_type: 'NEUTRAL', payload: {} } },
      { key: 'SEMIFINALS', node_type: 'ROUND', role: 'FINAL_EIGHT', team_count: 4, pairing: { type: 'FIXED_BRACKET', payload: { paths: ['WINNER_1_VS_8_VS_WINNER_2_VS_7', 'WINNER_3_VS_6_VS_WINNER_4_VS_5'] } }, contest: { format_type: 'SINGLE_GAME', requires_winner: true }, hosting: { rule_type: 'NEUTRAL', payload: {} } },
      { key: 'FINAL', node_type: 'ROUND', role: 'FINAL', team_count: 2, contest: { format_type: 'SINGLE_GAME', requires_winner: true }, hosting: { rule_type: 'NEUTRAL', payload: {} } },
    ], edges: [ { from: 'QUARTERFINALS', to: 'SEMIFINALS', selector: 'WINNER' }, { from: 'SEMIFINALS', to: 'FINAL', selector: 'WINNER' } ] }],
    sources: [{ url: 'https://www.acb.com', type: 'OFFICIAL' }],
  })
}

function completeGames(world: ReturnType<typeof bootstrapGameWorldFromWorldDb>, games: readonly ReturnType<typeof createGame>[]) {
  const ids = new Set(games.map((game) => game.id))
  return updateGameWorld(world, { games: Object.values(world.games).map((game) => ids.has(game.id) && game.status === 'scheduled' ? createGame({ ...game, status: 'completed', result: { homeScore: 100, awayScore: 80 } }) : game) })
}

function completeGamesWithTrigger(world: ReturnType<typeof bootstrapGameWorldFromWorldDb>, games: readonly ReturnType<typeof createGame>[]) {
  const scheduled = games.filter((game) => world.games[game.id]?.status === 'scheduled')
  if (scheduled.length === 0) return world
  const trigger = scheduled.at(-1)!
  const prepared = completeGames(world, scheduled.slice(0, -1))
  return applyMatchResult(prepared, { gameId: trigger.id, homeTeamId: trigger.homeTeamId, awayTeamId: trigger.awayTeamId, homeScore: 100, awayScore: 80 })
}


describe('PLAYER 2.4-D3 real WorldDB source to GameWorld and Save V4', () => {
  const pin = { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema }
  const sourceFacts = {
    version: 'PLAYER-2.4-D1-40-TRAITS-60-MOVES-V1' as const,
    contextualTraits: [{ code: 'HIGH_MOTOR', strength: 92, startedOn: '2025-09-01' }],
    technicalMoves: [{ code: 'CROSSOVER', proficiency: 81, usageTendency: 37, asOfOn: '2025-10-01' }],
    basketballSpecializationTraits: [{ code: 'SHOOTING_GRAVITY', startedOn: '2025-09-01' }],
  }
  it('preserves optional original WorldDB facts by player ID without touching Player.traitIds', () => {
    const original = slice()
    const selected = original.players[0]!
    const enriched = { ...original, players: original.players.map((player, i) => i === 0 ? { ...player, repertoire: sourceFacts } : player) }
    const world = bootstrapGameWorldFromWorldDb(enriched, selection, pin)
    const imported = world.playerRepertoireByPlayerId[selected.playerId]
    expect(imported).toMatchObject({ playerId: selected.playerId, ...sourceFacts })
    expect(world.players[selected.playerId as never]!.basketball.traitIds).toEqual([])
    const saved = serializeGameWorldV4(world, '2026-10-17T12:00:00.000Z')
    const loaded = deserializeGameWorldV4(JSON.parse(JSON.stringify(saved)))
    expect(loaded.playerRepertoireByPlayerId[selected.playerId]).toEqual(imported)
    expect(loaded.players[selected.playerId as never]!.basketball.traitIds).toEqual([])
    expect(Object.keys(bootstrapGameWorldFromWorldDb(original, selection, pin).playerRepertoireByPlayerId)).toHaveLength(0)
  })
  it('rejects future evidence, duplicate moves and out-of-range source values before creating GameWorld', () => {
    const original = slice()
    const inject = (repertoire: unknown) => ({ ...original, players: original.players.map((player, i) => i === 0 ? { ...player, repertoire } : player) } as WorldDbGameBootstrapSliceV1)
    expect(() => bootstrapGameWorldFromWorldDb(inject({ ...sourceFacts, technicalMoves: [{ ...sourceFacts.technicalMoves[0], asOfOn: '2026-07-01' }] }), selection, pin)).toThrow(/future-dated/)
    expect(() => bootstrapGameWorldFromWorldDb(inject({ ...sourceFacts, technicalMoves: [...sourceFacts.technicalMoves, ...sourceFacts.technicalMoves] }), selection, pin)).toThrow(/duplicate/)
    expect(() => bootstrapGameWorldFromWorldDb(inject({ ...sourceFacts, contextualTraits: [{ ...sourceFacts.contextualTraits[0], strength: 140 }] }), selection, pin)).toThrow()
  })
})
