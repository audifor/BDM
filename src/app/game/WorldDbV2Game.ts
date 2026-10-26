import referenceBundle from '@/data/worlddb-v2/competition-runtime.json';
import { parseWorldCompetitionRuntimeBundle } from '@/domain/competition';
import { parseGameDate } from '@/domain/date';
import { countryIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids';
import { calculateAge, createPlayer } from '@/domain/player';
import { PLAYER_TRUTH_RATING_KEYS, PLAYER_TRUTH_TENDENCY_KEYS } from '@/domain/player/PlayerTruthCatalog';
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff';
import { attachWorldDbCompetitionRuntime, type GameWorld } from '@/domain/world';
import { generateCanonicalDevelopmentProfile, generateCanonicalRatings } from '@/engine/world/CanonicalPlayerTruthGenerator';
import { generatePlayerBio } from '@/engine/world/PlayerBioGenerator';
import { generateInitialTeamStaff } from '@/engine/world/StaffGenerator';
import { hashStringToSeed } from '@/engine/random';
import { ensureUserClubBoardState } from '@/engine/board';
import { ensureCanonicalFinanceFoundation, resolveOrganizationCurrency } from '@/domain/finance';
import { buildWorldDbV2, type WorldDbV2Snapshot } from '@/tauri/TauriWorldDbV2';
import type { WorldDbGameBootstrapSliceV1 } from '@/domain/worldDb/GameBootstrap';
import { assertWorldDbGameBootstrapSliceV1 } from '@/domain/worldDb/GameBootstrap';
import type { WorldDbSelectionCatalogV1 } from '@/domain/worldDb/SelectionCatalog';
import { assertWorldDbSelectionCatalogV1 } from '@/domain/worldDb/SelectionCatalog';
import { WorldDbSessionV1 } from './WorldDbSession';
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository';
import { spainAcbCalendarForStartYear } from '@/data/worldCompetitionCalendars';
import { gameBalanceOpeningEconomicStates, applyGameBalanceBootstrap } from '@/app/gameBalance/GameBalanceBootstrap';
import { annualAuthorizationContinuityAuthorities } from './AnnualAuthorizationContinuityPolicy';
import { appointCreatedUserCoachToWorldDbClub } from './WorldDbUserCoachAppointment';
import type { UserCoachCreationInput } from './UserCoachCreator';
const COMPETITION = 'competition:ESP:liga-endesa';
const EDITION = 'edition:ESP:liga-endesa:2025-26';
const ECOSYSTEM = 'ecosystem:ESP:acb';
const bundle = parseWorldCompetitionRuntimeBundle(referenceBundle);
const pick = (value: Readonly<Record<string, number>>, keys: readonly string[]) => Object.fromEntries(keys.map(k => [k, value[k]!]));
const dob = (r: Record<string, any>) => `${r.annee_naissance}-${String(r.mois_naissance).padStart(2, '0')}-${String(r.jour_naissance).padStart(2, '0')}`;
const country = (id: number) => `pbm:DYN_pays:${id}`;
const positions = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const aptitude = ['aptitude_meneur', 'aptitude_arriere', 'aptitude_ailier', 'aptitude_interieur', 'aptitude_pivot'];
const developmentCodes = ['SHOOTING', 'FINISHING', 'BALL_HANDLING', 'PLAYMAKING', 'OFF_BALL_OFFENSE', 'DEFENSE_REBOUNDING', 'PHYSICAL', 'MENTAL'] as const;
const developmentDomains = ['shooting', 'finishing', 'creation', 'passing', 'creation', 'defense', 'physical', 'mental'] as const;
/** The DDL DTO is an application projection. The raw SQLite remains PBM V2, not a DDL database.
 * Competition/edition keys refer to the unchanged certified rules template; source identity is
 * persisted separately. PBM club/person IDs are preserved exactly in their runtime namespaces. */
export function projectWorldDbV2(snapshot: WorldDbV2Snapshot): WorldDbGameBootstrapSliceV1 {
    const day = parseGameDate(snapshot.manifest.configuration.start_date), seed = hashStringToSeed(snapshot.manifest.configuration.seed);
    const year = Number(day.slice(0, 4)) + (day.slice(5) > '10-04' ? 1 : 0);
    const calendar = spainAcbCalendarForStartYear(year);
    const countries = snapshot.countries.map(e => ({ countryId: e.entity_id, name: String(e.reference_data.nom_pays), code: String(e.reference_data.abreviation) }));
    const countryIds = new Set(countries.map(c => c.countryId));
    const teams = snapshot.clubs.map(e => ({ teamId: e.entity_id, name: String(e.reference_data.nom_equipe), countryId: e.parent_id!, gender: e.reference_data.sexe === 1 ? 'female' as const : 'male' as const, organizationId: e.entity_id + ':organization', organizationSectionId: e.entity_id + ':section' }));
    const persons: WorldDbGameBootstrapSliceV1['persons'][number][] = [];
    const players: WorldDbGameBootstrapSliceV1['players'][number][] = [];
    for (const entity of snapshot.people) {
        const r = entity.reference_data, id = entity.entity_id, isPlayer = entity.source_table === 'DYN_joueur';
        if (isPlayer && (r.is_alive === 0 || r.retraite === 1))
            continue;
        const pos = positions[aptitude.reduce((best, key, i) => Number(r[key] ?? 0) > Number(r[aptitude[best]!] ?? 0) ? i : best, 0)]!;
        const bio = generatePlayerBio(id, pos, day);
        const firstName = String(isPlayer ? r.joueur_prenom : r.prenom), lastName = String(isPlayer ? r.joueur_nom : r.nom);
        const nat = country(Number(isPlayer ? r.nationalite : r.nationalite_id));
        if (!countryIds.has(nat))
            throw new Error(`PBM nationality unresolved: ${id}`);
        // Preserve sourced dimensions. Missing reach measurements use the existing BDM bio stream.
        persons.push({ personId: id, firstName, lastName, gender: r.sexe === 1 ? 'female' : 'male', dateOfBirth: dob(r), nationalityIds: [nat], measurementProvenance: { wingspanCm: 'generated', standingReachCm: 'generated', dominantHand: isPlayer ? 'sourced' : 'generated' }, physical: { heightCm: r.taille > 0 ? r.taille : bio.heightCm, weightKg: r.poids > 0 ? r.poids : bio.weightKg, wingspanCm: bio.wingspanCm, standingReachCm: bio.standingReachCm } });
        if (!isPlayer)
            continue;
        const pid = playerIdFromString(id), ratings = generateCanonicalRatings(seed, pid, pos);
        const tendencies = createPlayer({ id: pid, firstName, lastName, gender: r.sexe === 1 ? 'female' : 'male', nationalityId: countryIdFromString(nat), basketball: { primaryPosition: pos, ratings }, bio: { ...bio, dateOfBirth: parseGameDate(dob(r)) } }).basketball.tendencies;
        const development = generateCanonicalDevelopmentProfile(seed, pid, ratings, calculateAge(parseGameDate(dob(r)), day));
        players.push({ playerId: id, personId: id, primaryPosition: pos, secondaryPositions: [], dominantHand: Number(r.main_gauche) > Number(r.main_droite) ? 'LEFT' : 'RIGHT', ratings: pick(ratings, PLAYER_TRUTH_RATING_KEYS), tendencies: pick(tendencies, PLAYER_TRUTH_TENDENCY_KEYS), development: developmentCodes.map((code, i) => ({ dimensionCode: code, ceiling: development.ceilings[developmentDomains[i]!], growthRate: development.growthRate, declineSensitivity: development.declineSensitivity })) });
    }
    const staffProfiles: WorldDbGameBootstrapSliceV1['staffProfiles'][number][] = [];
    const staffAssignments: WorldDbGameBootstrapSliceV1['staffAssignments'][number][] = [];
    for (const team of teams) {
        const staff = snapshot.people.filter(e => e.source_table === 'DYN_person' && e.parent_id === team.teamId).sort((a, b) => Number(b.reference_data.job_preference_coach) - Number(a.reference_data.job_preference_coach) || a.entity_id.localeCompare(b.entity_id));
        const coach = staff[0];
        if (coach === undefined)
            throw new Error(`PBM pilot club lacks an original head-coach candidate: ${team.teamId}`);
        const generated = generateInitialTeamStaff(teamIdFromString(team.teamId), 'assistantCoach', day);
        // Reversible expansion of BDM's 13 canonical generated Staff values into the legacy 80-vector
        // transport. The existing bootstrap bucket means recover each value exactly; no PBM scaling.
        const attributes: Record<string, number> = {};
        STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.forEach((key, i) => { for (let j = Math.floor(i * 80 / STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.length); j < Math.floor((i + 1) * 80 / STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.length); j++)
            attributes[`STAFF_ATTRIBUTE_${String(j + 1).padStart(2, '0')}`] = generated.person.professional.attributes[key]; });
        staffProfiles.push({ staffId: coach.entity_id, personId: coach.entity_id, attributes, specialismIds: [] });
        staffAssignments.push({ assignmentId: `${coach.entity_id}:headCoach:${team.teamId}`, staffId: coach.entity_id, teamId: team.teamId, roleCode: 'headCoach', assignedOn: day });
        if (players.filter(p => snapshot.people.find(e => e.entity_id === p.playerId)?.parent_id === team.teamId).length < 5)
            throw new Error(`PBM pilot roster incomplete: ${team.teamId}`);
    }
    const result: WorldDbGameBootstrapSliceV1 = { schemaVersion: 1, source: { databaseId: 'worlddb-v2-projection:' + snapshot.manifest.master.sha256, schemaId: bundle.worldDbSchema }, ecosystem: { ecosystemId: ECOSYSTEM, name: 'PBM Spain · BDM ACB rules', kind: 'fibaLike', category: 'men' }, competition: { competitionId: COMPETITION, name: 'Liga Endesa · PBM V2', gender: 'male', ecosystemId: ECOSYSTEM }, season: { competitionSeasonId: EDITION, seasonId: 'worlddb-v2:season:' + day, label: `${year}-${year + 1} · fictional PBM snapshot`, startDate: day, endDate: calendar.seasonWindow.endDate, provenance: 'DERIVED_SIMULATION_FROM_B04' }, countries, teams, persons, players, staffProfiles, staffAssignments, organizations: teams.map(t => ({ organizationId: t.organizationId, entityId: t.teamId, legalName: t.name, foundedYear: null, dissolvedYear: null, primaryPlaceId: null, website: null })), organizationSections: teams.map(t => ({ sectionId: t.organizationSectionId, organizationId: t.organizationId, sport: 'BASKETBALL', gender: 'MALE', categoryScope: 'SENIOR', canonicalName: t.name, validFrom: null, validTo: null })), rosterAssignments: players.map(p => ({ rosterId: 'pbm:roster:' + p.playerId, teamId: snapshot.people.find(e => e.entity_id === p.playerId)!.parent_id!, playerId: p.playerId, status: 'ACTIVE' })), matches: [] };
    const sourced = { ...result, physicalContent: snapshot.physicalContent };
    assertWorldDbGameBootstrapSliceV1(sourced);
    return sourced;
}
export function worldDbV2Repository(slice: WorldDbGameBootstrapSliceV1): WorldDatabaseRepository {
    const catalog: WorldDbSelectionCatalogV1 = { schemaVersion: 1, source: slice.source, ecosystems: [{ ecosystemId: ECOSYSTEM, code: 'WORLDDB_V2_PILOT', name: 'PBM WorldDB V2', gender: 'male' }], levels: [], units: [], competitionAssignments: [{ assignmentId: 'worlddb-v2:acb', ecosystemId: ECOSYSTEM, competitionId: COMPETITION, competitionName: slice.competition.name, levelId: null, unitId: null, roleType: 'LEAGUE' }], competitionSeasons: [{ competitionSeasonId: EDITION, competitionId: COMPETITION, seasonId: slice.season.seasonId, competitionName: slice.competition.name, editionNumber: null }], teamMemberships: slice.teams.map(t => ({ membershipId: 'worlddb-v2:membership:' + t.teamId, ecosystemId: ECOSYSTEM, teamId: t.teamId, teamName: t.name, levelId: null, membershipStatus: 'ACTIVE', validFrom: null, validTo: null })), teamUnitMemberships: [] };
    assertWorldDbSelectionCatalogV1(catalog);
    return {
        async inspectDatabase() { return { schemaVersion: 1, source: slice.source, competitionSeasonIds: [EDITION] }; },
        async loadSelectionCatalog() { return catalog; },
        async loadGameBootstrapSlice() { return slice; },
        async loadCompetitionRuntimeBundle() { return bundle; },
        async loadCompetitionSeason() { return { schemaVersion: 1, source: slice.source, competitionSeason: { competitionSeasonId: EDITION, competitionId: COMPETITION, seasonId: slice.season.seasonId, editionNumber: null }, entries: slice.teams.map(t => ({ competitionSeasonEntryId: 'pbm:entry:' + t.teamId, teamId: t.teamId })), structureNodes: [], structureEdges: [], structureEntryAssignments: [], fixtures: [], fixtureSides: [], rulePayloads: {} }; },
        async loadMatchRealizations() { return { schemaVersion: 1, competitionSeasonId: EDITION, matches: [], realizations: [] }; },
    };
}
export async function createWorldDbV2GameFromSnapshot(snapshot: WorldDbV2Snapshot, teamId: string, userCoachCreation?: UserCoachCreationInput): Promise<GameWorld> {
    const slice = projectWorldDbV2(snapshot), repository = worldDbV2Repository(slice);
    const session = new WorldDbSessionV1({ repository, databasePath: 'worlddb-v2:projection', runtimeBundlePath: 'worlddb-v2:rules-template' });
    await session.open();
    try {
        const day = parseGameDate(snapshot.manifest.configuration.start_date), year = Number(day.slice(0, 4)) + (day.slice(5) > '10-04' ? 1 : 0);
        const baseCalendar = spainAcbCalendarForStartYear(year);
        // A shifted fictional edition preserves the reference cadence relative to its opening
        // date. Keeping the 2025 weekdays literally can push round 34 outside the shifted window.
        // This changes calendar inputs only; the existing scheduler and sporting rules stay intact.
        const weekday = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay();
        const shift = weekday(baseCalendar.regularSeasonWindow.startDate) - weekday(spainAcbCalendarForStartYear(2025).regularSeasonWindow.startDate);
        const rotate = (dayOfWeek: number) => (dayOfWeek + shift + 7) % 7;
        const calendar = { ...baseCalendar, seasonWindow: { startDate: day, endDate: slice.season.endDate as typeof day }, specialCompetitionWindows: [], regularSeasonCadence: { ...baseCalendar.regularSeasonCadence, preferredWeekdays: baseCalendar.regularSeasonCadence.preferredWeekdays.map(rotate), midweekWeekdays: baseCalendar.regularSeasonCadence.midweekWeekdays.map(rotate) } };
        let world = await session.bootstrapGameWorld({ source: slice.source, ecosystemId: ECOSYSTEM, competitionId: COMPETITION, competitionSeasonId: EDITION, teamId }, calendar);
        if (userCoachCreation)
            world = appointCreatedUserCoachToWorldDbClub(world, teamIdFromString(teamId), userCoachCreation);
        world = ensureUserClubBoardState(world);
        const openingEconomicStates = gameBalanceOpeningEconomicStates(world, id => { const r = resolveOrganizationCurrency(world, id); return r.status === 'RESOLVED' ? String(r.currencyCode) : null; });
        world = applyGameBalanceBootstrap(ensureCanonicalFinanceFoundation(world, { authorizationRenewalPolicies: annualAuthorizationContinuityAuthorities(world), openingEconomicStates }));
        world = attachWorldDbCompetitionRuntime(world, { ...world.worldDbCompetitionRuntime!, worldDbV2: { masterSha256: snapshot.manifest.master.sha256, sourceDate: '2025-07-01', startDate: day, seed: snapshot.manifest.configuration.seed, sourceCompetitionId: 'pbm:DYN_championnat:5', nativeCompetitionId: COMPETITION, fictional: true, profiles: 'BDM_GENERATED_CANONICAL', economy: 'BDM_GAME_BALANCE_NOT_PBM' } });
        return world;
    }
    finally {
        session.close();
    }
}
export async function createWorldDbV2Game(sourceRoot: string, startDate: string, seed: string, teamId: string, userCoachCreation?: UserCoachCreationInput) {
    return createWorldDbV2GameFromSnapshot(await buildWorldDbV2(sourceRoot, startDate, seed), teamId, userCoachCreation);
}
