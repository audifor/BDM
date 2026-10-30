import referenceBundle from '@/data/worlddb-v2/competition-runtime.json';
import additionalFormats from '@/data/worlddb-v2/additional-formats.json';
import { parseWorldCompetitionRuntimeBundle, parseWorldCompetitionFormatDocument, type WorldCompetitionRuntimeBundle } from '@/domain/competition';
import { parseGameDate } from '@/domain/date';
import { countryIdFromString, playerIdFromString, personIdFromString, teamIdFromString } from '@/domain/ids';
import { createPerson } from '@/domain/person';
import { calculateAge, createPlayer } from '@/domain/player';
import { PLAYER_TRUTH_RATING_KEYS, PLAYER_TRUTH_TENDENCY_KEYS } from '@/domain/player/PlayerTruthCatalog';
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff';
import { attachWorldDbCompetitionRuntime, updateGameWorld, type GameWorld } from '@/domain/world';
import { generateInitialPlayerContract } from '@/engine/world/PlayerContractGenerator';
import { ensureTeamFinances } from '@/engine/world/TeamFinancesEnrichment';
import { createGeneratedProfessionalSalaryRulesV1 } from './GeneratedProfessionalSalaryRules';
import { worldDbV2Competition, worldDbV2Calendar, worldDbV2SeasonEnd } from './WorldDbV2Competitions';
import { bindWorldDbV2FrenchFormat } from './WorldDbV2FrenchFormatBinding';
import { worldDbV2ConnectionBlockers } from './WorldDbV2Connection';
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
import { gameBalanceOpeningEconomicStates, applyGameBalanceBootstrap } from '@/app/gameBalance/GameBalanceBootstrap';
import { annualAuthorizationContinuityAuthorities } from './AnnualAuthorizationContinuityPolicy';
import { appointCreatedUserCoachToWorldDbClub } from './WorldDbUserCoachAppointment';
import type { UserCoachCreationInput } from './UserCoachCreator';
/** Candidate league metadata extends the published 4-league configuration without
 * making a generated simulation eligible for NEW GAME. */
export type WorldDbV2CompetitionConfig = ReturnType<typeof worldDbV2Competition> & {
    readonly formatProvenance?: string;
};
const reference = parseWorldCompetitionRuntimeBundle(referenceBundle);
// Preserve the frozen bundle identity; supplemental documents retain their own
// sources in the persisted format. Never relabel a SHA as the bundle's BLAKE3.
const bundle: WorldCompetitionRuntimeBundle = { ...reference, competitionFormats: [...reference.competitionFormats, ...additionalFormats.map(parseWorldCompetitionFormatDocument)] };
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
export function projectWorldDbV2(snapshot: WorldDbV2Snapshot, config: WorldDbV2CompetitionConfig = worldDbV2Competition(snapshot.competitions[0]?.entity_id)): WorldDbGameBootstrapSliceV1 {
    const day = parseGameDate(snapshot.manifest.configuration.start_date), seed = hashStringToSeed(snapshot.manifest.configuration.seed);
    // Repair source shortfalls only in explicitly generated simulation careers.
    // Source-backed competitions and their original PBM people remain unchanged.
    const allowSimulationPopulation = 'formatProvenance' in config && config.formatProvenance === 'GENERATED_SIMULATION';
    const year = Number(day.slice(0, 4)) + (config.calendar === 'SPAIN_ACB_EXISTING' && day.slice(5) > '10-04' ? 1 : 0);
    const { nativeCompetitionId: COMPETITION, editionId: EDITION, ecosystemId: ECOSYSTEM } = config;
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
    const rosterTeamByPlayerId = new Map(snapshot.people.filter(e => e.source_table === 'DYN_joueur')
        .map(e => [e.entity_id, e.parent_id] as const));
    for (const team of teams) {
        const staff = snapshot.people.filter(e => e.source_table === 'DYN_person' && e.parent_id === team.teamId).sort((a, b) => Number(b.reference_data.job_preference_coach) - Number(a.reference_data.job_preference_coach) || a.entity_id.localeCompare(b.entity_id));
        const coach = staff.find(e => !allowSimulationPopulation || (Number(e.reference_data.job_preference_coach ?? 0) > 0
            && Number(e.reference_data.job_preference_coach ?? 0) > Number(e.reference_data.job_preference_chairman ?? 0)));
        if (coach === undefined && !allowSimulationPopulation)
            throw new Error(`PBM pilot club lacks an original head-coach candidate: ${team.teamId}`);
        const generated = generateInitialTeamStaff(teamIdFromString(team.teamId), 'assistantCoach', day);
        // The generated coach retains a separate BDM id. Never reassign a source
        // chairman or invent a PBM identity to fill the sporting vacancy.
        const coachId = coach?.entity_id ?? String(generated.person.id);
        if (coach === undefined) {
            persons.push({
                personId: coachId,
                firstName: generated.person.identity.firstName,
                lastName: generated.person.identity.lastName,
                gender: team.gender,
                dateOfBirth: '1980-01-01',
                nationalityIds: [team.countryId],
            });
        }
        // Reversible expansion of BDM's 13 canonical generated Staff values into the legacy 80-vector
        // transport. The existing bootstrap bucket means recover each value exactly; no PBM scaling.
        const attributes: Record<string, number> = {};
        STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.forEach((key, i) => { for (let j = Math.floor(i * 80 / STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.length); j < Math.floor((i + 1) * 80 / STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.length); j++)
            attributes[`STAFF_ATTRIBUTE_${String(j + 1).padStart(2, '0')}`] = generated.person.professional.attributes[key]; });
        staffProfiles.push({ staffId: coachId, personId: coachId, attributes, specialismIds: [] });
        staffAssignments.push({ assignmentId: `${coachId}:headCoach:${team.teamId}`, staffId: coachId, teamId: team.teamId, roleCode: 'headCoach', assignedOn: day });
        const originalRosterSize = players.filter(p => rosterTeamByPlayerId.get(p.playerId) === team.teamId).length;
        if (originalRosterSize < 5 && !allowSimulationPopulation)
            throw new Error(`PBM pilot roster incomplete: ${team.teamId}`);
        for (let slot = originalRosterSize; slot < (allowSimulationPopulation ? 5 : originalRosterSize); slot++) {
            const playerId = `bdm:generated-player:${team.teamId}:${slot + 1}`;
            const position = positions[slot % positions.length]!;
            const id = playerIdFromString(playerId);
            const bio = generatePlayerBio(id, position, day);
            const ratings = generateCanonicalRatings(seed, id, position);
            const firstName = 'Jugador', lastName = `Generado ${slot + 1}`;
            const simulated = createPlayer({
                id, firstName, lastName, gender: team.gender,
                nationalityId: countryIdFromString(team.countryId),
                basketball: { primaryPosition: position, ratings }, bio,
            });
            const development = generateCanonicalDevelopmentProfile(seed, id, ratings, calculateAge(bio.dateOfBirth, day));
            persons.push({
                personId: playerId, firstName, lastName, gender: team.gender,
                dateOfBirth: bio.dateOfBirth, nationalityIds: [team.countryId],
                measurementProvenance: {
                    wingspanCm: 'generated', standingReachCm: 'generated', dominantHand: 'generated',
                },
                physical: {
                    heightCm: bio.heightCm, weightKg: bio.weightKg,
                    wingspanCm: bio.wingspanCm, standingReachCm: bio.standingReachCm,
                },
            });
            players.push({
                playerId, personId: playerId, primaryPosition: position,
                secondaryPositions: [], dominantHand: bio.dominantHand,
                ratings: pick(ratings, PLAYER_TRUTH_RATING_KEYS),
                tendencies: pick(simulated.basketball.tendencies, PLAYER_TRUTH_TENDENCY_KEYS),
                development: developmentCodes.map((code, i) => ({
                    dimensionCode: code, ceiling: development.ceilings[developmentDomains[i]!],
                    growthRate: development.growthRate, declineSensitivity: development.declineSensitivity,
                })),
            });
            rosterTeamByPlayerId.set(playerId, team.teamId);
        }
    }
    const result: WorldDbGameBootstrapSliceV1 = { schemaVersion: 1, source: { databaseId: 'worlddb-v2-projection:' + snapshot.manifest.master.sha256, schemaId: bundle.worldDbSchema }, ecosystem: { ecosystemId: ECOSYSTEM, name: config.name + ' PBM ecosystem', kind: 'fibaLike', category: 'men' }, competition: { competitionId: COMPETITION, name: config.name + ' · PBM V2', gender: 'male', ecosystemId: ECOSYSTEM }, season: { competitionSeasonId: EDITION, seasonId: 'worlddb-v2:season:' + (config.countryCode === 'ESP' ? '' : config.sourceCompetitionId + ':') + day, label: `${year}-${year + 1} · fictional PBM snapshot`, startDate: day, endDate: worldDbV2SeasonEnd(config, day), provenance: 'DERIVED_SIMULATION_FROM_B04' }, countries, teams, persons, players, staffProfiles, staffAssignments, organizations: teams.map(t => ({ organizationId: t.organizationId, entityId: t.teamId, legalName: t.name, foundedYear: null, dissolvedYear: null, primaryPlaceId: null, website: null })), organizationSections: teams.map(t => ({ sectionId: t.organizationSectionId, organizationId: t.organizationId, sport: 'BASKETBALL', gender: 'MALE', categoryScope: 'SENIOR', canonicalName: t.name, validFrom: null, validTo: null })), rosterAssignments: players.map(p => ({
        rosterId: p.playerId.startsWith('bdm:generated-player:') ? 'bdm:roster:' + p.playerId : 'pbm:roster:' + p.playerId,
        teamId: rosterTeamByPlayerId.get(p.playerId)!, playerId: p.playerId, status: 'ACTIVE',
    })), matches: [] };
    const sourced = { ...result, physicalContent: snapshot.physicalContent };
    assertWorldDbGameBootstrapSliceV1(sourced);
    return sourced;
}
export function worldDbV2Repository(slice: WorldDbGameBootstrapSliceV1, runtimeBundle = bundle): WorldDatabaseRepository {
    const COMPETITION = slice.competition.competitionId, EDITION = slice.season.competitionSeasonId, ECOSYSTEM = slice.ecosystem.ecosystemId;
    const catalog: WorldDbSelectionCatalogV1 = { schemaVersion: 1, source: slice.source, ecosystems: [{ ecosystemId: ECOSYSTEM, code: 'WORLDDB_V2_PILOT', name: 'PBM WorldDB V2', gender: 'male' }], levels: [], units: [], competitionAssignments: [{ assignmentId: 'worlddb-v2:' + COMPETITION, ecosystemId: ECOSYSTEM, competitionId: COMPETITION, competitionName: slice.competition.name, levelId: null, unitId: null, roleType: 'LEAGUE' }], competitionSeasons: [{ competitionSeasonId: EDITION, competitionId: COMPETITION, seasonId: slice.season.seasonId, competitionName: slice.competition.name, editionNumber: null }], teamMemberships: slice.teams.map(t => ({ membershipId: 'worlddb-v2:membership:' + t.teamId, ecosystemId: ECOSYSTEM, teamId: t.teamId, teamName: t.name, levelId: null, membershipStatus: 'ACTIVE', validFrom: null, validTo: null })), teamUnitMemberships: [] };
    assertWorldDbSelectionCatalogV1(catalog);
    return {
        async inspectDatabase() { return { schemaVersion: 1, source: slice.source, competitionSeasonIds: [EDITION] }; },
        async loadSelectionCatalog() { return catalog; },
        async loadGameBootstrapSlice() { return slice; },
        async loadCompetitionRuntimeBundle() { return runtimeBundle; },
        async loadCompetitionSeason() { return { schemaVersion: 1, source: slice.source, competitionSeason: { competitionSeasonId: EDITION, competitionId: COMPETITION, seasonId: slice.season.seasonId, editionNumber: null }, entries: slice.teams.map(t => ({ competitionSeasonEntryId: 'pbm:entry:' + t.teamId, teamId: t.teamId })), structureNodes: [], structureEdges: [], structureEntryAssignments: [], fixtures: [], fixtureSides: [], rulePayloads: {} }; },
        async loadMatchRealizations() { return { schemaVersion: 1, competitionSeasonId: EDITION, matches: [], realizations: [] }; },
    };
}
export async function createWorldDbV2GameFromSnapshot(snapshot: WorldDbV2Snapshot, teamId: string, userCoachCreation?: UserCoachCreationInput, config: WorldDbV2CompetitionConfig = worldDbV2Competition(snapshot.competitions[0]?.entity_id), runtimeBundle = bundle): Promise<GameWorld> {
    if (config.sourceCompetitionId !== snapshot.competitions[0]?.entity_id) throw Error('PBM competition/config identity mismatch');
    const format = runtimeBundle.competitionFormats.find(f => f.competitionSeasonId === config.editionId && f.competitionId === config.nativeCompetitionId);
    if (!format) throw Error('Verified runtime format/edition mapping required: ' + config.sourceCompetitionId);
    const frozenTemplatePolicy = reference.competitionFormats.some(f => f.competitionSeasonId === format.competitionSeasonId && f.competitionId === format.competitionId);
    const blockers = worldDbV2ConnectionBlockers(format, snapshot.clubs.length, frozenTemplatePolicy);
    if (blockers.length) throw Error(blockers.join(' | '));
    const slice = projectWorldDbV2(snapshot, config), repository = worldDbV2Repository(slice, runtimeBundle);
    const session = new WorldDbSessionV1({ repository, databasePath: 'worlddb-v2:projection', runtimeBundlePath: 'worlddb-v2:rules-template' });
    await session.open();
    try {
        const day = parseGameDate(snapshot.manifest.configuration.start_date);
        const { nativeCompetitionId: COMPETITION, editionId: EDITION, ecosystemId: ECOSYSTEM } = config;
        const calendar = worldDbV2Calendar(config, day);
        let world = await session.bootstrapGameWorld({ source: slice.source, ecosystemId: ECOSYSTEM, competitionId: COMPETITION, competitionSeasonId: EDITION, teamId }, calendar);
        if (userCoachCreation)
            world = appointCreatedUserCoachToWorldDbClub(world, teamIdFromString(teamId), userCoachCreation);
        world = ensureUserClubBoardState(world);
        const freePlayers = (snapshot.freeAgents ?? []).map(entity => {
            const r = entity.reference_data, id = playerIdFromString(entity.entity_id), seed = hashStringToSeed(snapshot.manifest.configuration.seed);
            const position = positions[aptitude.reduce((best, key, i) => Number(r[key] ?? 0) > Number(r[aptitude[best]!] ?? 0) ? i : best, 0)]!;
            const ratings = generateCanonicalRatings(seed, id, position), bio = generatePlayerBio(id, position, day);
            return createPlayer({ id, personId: personIdFromString(id), firstName: String(r.joueur_prenom), lastName: String(r.joueur_nom), gender: 'male', nationalityId: countryIdFromString(country(Number(r.nationalite))), basketball: { primaryPosition: position, ratings }, bio: { ...bio, dateOfBirth: parseGameDate(dob(r)), heightCm: r.taille > 0 ? r.taille : bio.heightCm, weightKg: r.poids > 0 ? r.poids : bio.weightKg, dominantHand: Number(r.main_gauche) > Number(r.main_droite) ? 'LEFT' : 'RIGHT', measurementProvenance: { wingspanCm: 'generated', standingReachCm: 'generated', dominantHand: 'sourced' } }, development: generateCanonicalDevelopmentProfile(seed, id, ratings, calculateAge(parseGameDate(dob(r)), day)) });
        });
        world = updateGameWorld(world, { players: [...Object.values(world.players), ...freePlayers], persons: [...Object.values(world.personsById), ...freePlayers.map(p => createPerson({ id: personIdFromString(p.id), firstName: p.firstName, lastName: p.lastName, gender: p.gender, dateOfBirth: p.bio.dateOfBirth, nationalityIds: [p.nationalityId], physical: { heightCm: p.bio.heightCm, weightKg: p.bio.weightKg, wingspanCm: p.bio.wingspanCm, standingReachCm: p.bio.standingReachCm }, profileRefs: [{ kind: 'player', profileId: p.id }] }))] });
        // Synthetic native obligations, generated before Finance classifies payroll and budgets.
        // PBM contract records remain reference-only in the immutable master.
        world = updateGameWorld(world, { contracts: Object.values(world.teams).flatMap(team => team.rosterPlayerIds.map(id => generateInitialPlayerContract(world.players[id]!, team.id, day))) });
        // Reuse F3's fictional uncapped contract policy, never assert real ACB economic rules.
        world = updateGameWorld(world, { salaryRulesBySeasonId: { ...world.salaryRulesBySeasonId, [world.currentSeasonId!]: createGeneratedProfessionalSalaryRulesV1(world.currentSeasonId!) }, teamFinances: ensureTeamFinances({ currentDate: day, teams: Object.values(world.teams), contracts: Object.values(world.contractsById), teamFinances: Object.values(world.teamFinancesByTeamId) }) });
        // The selected fictional professional universe explicitly provisions EUR via
        // Finance's existing authority. PBM salary units are never converted here.
        const explicitOrganizationCurrencies = Object.values(world.teams).map(team => ({ organizationId: String(team.organizationId), currencyCode: config.currencyCode }));
        const openingEconomicStates = gameBalanceOpeningEconomicStates(world, id => { const r = resolveOrganizationCurrency(world, id, explicitOrganizationCurrencies); return r.status === 'RESOLVED' ? String(r.currencyCode) : null; });
        world = applyGameBalanceBootstrap(ensureCanonicalFinanceFoundation(world, { explicitOrganizationCurrencies, authorizationRenewalPolicies: annualAuthorizationContinuityAuthorities(world), openingEconomicStates }));
        world = attachWorldDbCompetitionRuntime(world, { ...world.worldDbCompetitionRuntime!, worldDbV2: { masterSha256: snapshot.manifest.master.sha256, sourceDate: '2025-07-01', startDate: day, seed: snapshot.manifest.configuration.seed, sourceCompetitionId: config.sourceCompetitionId, nativeCompetitionId: COMPETITION, fictional: true, profiles: 'BDM_GENERATED_CANONICAL', economy: 'BDM_GAME_BALANCE_NOT_PBM', contracts: 'BDM_GENERATED_INITIAL_V1_PBM_REFERENCE_ONLY', ...(snapshot.freeAgents === undefined ? {} : { freeAgents: config.countryCode === 'ESP' ? 'ORIGINAL_SPANISH_MALE_18_40_SEEDED_MAX_60' as const : 'ORIGINAL_COUNTRY_MALE_18_40_SEEDED_MAX_60' as const }) } });
        return bindWorldDbV2FrenchFormat(world);
    }
    finally {
        session.close();
    }
}
export async function createWorldDbV2Game(sourceRoot: string, startDate: string, seed: string, teamId: string, userCoachCreation?: UserCoachCreationInput, competitionId?: string) {
    return createWorldDbV2GameFromSnapshot(await buildWorldDbV2(sourceRoot, startDate, seed, competitionId), teamId, userCoachCreation);
}
