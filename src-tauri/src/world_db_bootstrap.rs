use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

const WORLD_DB_SCHEMA_ID: &str = "DDL-PHASE1-A";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapSourceV1 {
    database_id: String,
    schema_id: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapEcosystemV1 {
    ecosystem_id: String,
    name: String,
    kind: String,
    category: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapCompetitionV1 {
    competition_id: String,
    name: String,
    gender: String,
    ecosystem_id: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapSeasonV1 {
    competition_season_id: String,
    season_id: String,
    label: String,
    start_date: String,
    end_date: String,
    provenance: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapCountryV1 {
    country_id: String,
    name: String,
    code: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapOrganizationV1 {
    organization_id: String,
    entity_id: String,
    legal_name: Option<String>,
    founded_year: Option<i64>,
    dissolved_year: Option<i64>,
    primary_place_id: Option<String>,
    website: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapOrganizationSectionV1 {
    section_id: String,
    organization_id: String,
    sport: Option<String>,
    gender: Option<String>,
    category_scope: Option<String>,
    canonical_name: String,
    valid_from: Option<String>,
    valid_to: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapOrganizationOwnershipV1 {
    ownership_id: String,
    organization_id: String,
    owner_kind: String,
    owner_id: String,
    ownership_percentage: Option<f64>,
    valid_from: Option<String>,
    valid_to: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapOrganizationInvestorInterestV1 {
    interest_id: String,
    organization_id: String,
    investor_kind: String,
    investor_id: String,
    interest_type: String,
    status: Option<String>,
    opened_on: Option<String>,
    closed_on: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapTeamV1 {
    team_id: String,
    name: String,
    gender: String,
    country_id: String,
    organization_id: String,
    organization_section_id: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapPersonPhysicalV1 {
    height_cm: f64,
    weight_kg: f64,
    wingspan_cm: f64,
    standing_reach_cm: f64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapPersonV1 {
    person_id: String,
    first_name: String,
    last_name: String,
    gender: Option<String>,
    date_of_birth: Option<String>,
    nationality_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    physical: Option<WorldDbGameBootstrapPersonPhysicalV1>,
    #[serde(skip_serializing_if = "Option::is_none")]
    personality: Option<BTreeMap<String, u8>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapDevelopmentDimensionV1 {
    dimension_code: String,
    ceiling: f64,
    growth_rate: f64,
    decline_sensitivity: f64,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbContextualTraitV1 {
    code: String,
    strength: i64,
    started_on: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbTechnicalMoveV1 {
    code: String,
    proficiency: i64,
    usage_tendency: i64,
    as_of_on: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbBasketballSpecializationTraitV1 {
    code: String,
    started_on: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbPlayerRepertoireV1 {
    version: String,
    contextual_traits: Vec<WorldDbContextualTraitV1>,
    technical_moves: Vec<WorldDbTechnicalMoveV1>,
    basketball_specialization_traits: Vec<WorldDbBasketballSpecializationTraitV1>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapPlayerV1 {
    player_id: String,
    person_id: String,
    primary_position: String,
    secondary_positions: Vec<String>,
    position_familiarity: BTreeMap<String, Option<f64>>,
    dominant_hand: String,
    ratings: BTreeMap<String, f64>,
    tendencies: BTreeMap<String, f64>,
    development: Vec<WorldDbGameBootstrapDevelopmentDimensionV1>,
    #[serde(skip_serializing_if = "Option::is_none")]
    repertoire: Option<WorldDbPlayerRepertoireV1>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapStaffV1 {
    staff_id: String,
    person_id: String,
    attributes: BTreeMap<String, f64>,
    specialism_ids: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapStaffAssignmentV1 {
    assignment_id: String,
    staff_id: String,
    team_id: String,
    role_code: String,
    assigned_on: String,
}
/// A staff role of the World DB that BDM has no equivalent for (team delegate, sport psychologist…).
/// Reported, never mapped to a different role and never dropped silently.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbUnmappedStaffAssignmentV1 {
    assignment_id: String,
    person_id: String,
    team_id: String,
    role_code: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbContractTermV1 {
    season_label: String,
    term_type: String,
    amount_cents: i64,
    guaranteed_cents: i64,
}
/// Employment contract of a loaded player or staff member, money in minor units of its currency.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbContractV1 {
    contract_id: String,
    kind: String,
    person_id: String,
    organization_id: String,
    team_id: String,
    status: String,
    signed_on: Option<String>,
    effective_from: String,
    effective_to: String,
    currency_code: String,
    terms: Vec<WorldDbContractTermV1>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbBudgetV1 {
    budget_type: String,
    season_label: String,
    amount_cents: i64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbRevenueStreamV1 {
    stream_type: String,
    annual_amount_cents: i64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbOrganizationFinanceV1 {
    organization_id: String,
    currency_code: String,
    opening_cash_cents: Option<i64>,
    opening_on: Option<String>,
    budgets: Vec<WorldDbBudgetV1>,
    revenue_streams: Vec<WorldDbRevenueStreamV1>,
    annual_expense_commitments_cents: i64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbExecutiveV1 {
    assignment_id: String,
    person_id: String,
    organization_id: String,
    role_code: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbAgentRepresentationV1 {
    agent_person_id: String,
    client_person_id: String,
    status: String,
}
/// People of the universe that BDM does not yet turn into runtime actors (no domain for them):
/// carried so the import is lossless and an app can show what exists.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbProfessionalsV1 {
    executives: Vec<WorldDbExecutiveV1>,
    agent_representations: Vec<WorldDbAgentRepresentationV1>,
    agent_count: i64,
    official_count: i64,
    media_count: i64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapRosterAssignmentV1 {
    roster_id: String,
    team_id: String,
    player_id: String,
    status: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapMatchV1 {
    match_id: String,
    scheduled_at: Option<String>,
    played_at: Option<String>,
    status: String,
    home_team_id: String,
    away_team_id: String,
    home_score: Option<f64>,
    away_score: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapSliceV1 {
    physical_content: crate::world_db_facilities::PhysicalContent,
    schema_version: u8,
    source: WorldDbGameBootstrapSourceV1,
    ecosystem: WorldDbGameBootstrapEcosystemV1,
    competition: WorldDbGameBootstrapCompetitionV1,
    season: WorldDbGameBootstrapSeasonV1,
    countries: Vec<WorldDbGameBootstrapCountryV1>,
    organizations: Vec<WorldDbGameBootstrapOrganizationV1>,
    organization_sections: Vec<WorldDbGameBootstrapOrganizationSectionV1>,
    organization_ownership: Vec<WorldDbGameBootstrapOrganizationOwnershipV1>,
    organization_investor_interest: Vec<WorldDbGameBootstrapOrganizationInvestorInterestV1>,
    teams: Vec<WorldDbGameBootstrapTeamV1>,
    persons: Vec<WorldDbGameBootstrapPersonV1>,
    players: Vec<WorldDbGameBootstrapPlayerV1>,
    staff_profiles: Vec<WorldDbGameBootstrapStaffV1>,
    staff_assignments: Vec<WorldDbGameBootstrapStaffAssignmentV1>,
    roster_assignments: Vec<WorldDbGameBootstrapRosterAssignmentV1>,
    matches: Vec<WorldDbGameBootstrapMatchV1>,
    unmapped_staff_assignments: Vec<WorldDbUnmappedStaffAssignmentV1>,
    contracts: Vec<WorldDbContractV1>,
    finance: Vec<WorldDbOrganizationFinanceV1>,
    professionals: WorldDbProfessionalsV1,
}

pub fn load_game_bootstrap_slice_v1(
    database_path: &str,
    competition_season_id: &str,
    ecosystem_id: &str,
) -> Result<WorldDbGameBootstrapSliceV1, String> {
    if database_path.trim().is_empty()
        || competition_season_id.trim().is_empty()
        || ecosystem_id.trim().is_empty()
    {
        return Err("World DB bootstrap paths and IDs must be non-empty".to_owned());
    }
    let path = Path::new(database_path);
    if !path.is_file() {
        return Err(format!("World DB file does not exist: {}", path.display()));
    }
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("Unable to open World DB read-only: {error}"))?;
    connection
        .execute_batch("PRAGMA query_only = ON; PRAGMA foreign_keys = ON;")
        .map_err(|error| format!("Unable to configure World DB connection: {error}"))?;

    let context = connection.query_row(
        "SELECT cs.competition_id, ce.canonical_name, eco.name, eco.gender, c.gender FROM competition_season cs JOIN competition c ON c.competition_id=cs.competition_id JOIN entity ce ON ce.entity_id=c.entity_id JOIN ecosystem_competition_assignment a ON a.competition_id=c.competition_id JOIN competition_ecosystem eco ON eco.competition_ecosystem_id=a.competition_ecosystem_id WHERE cs.competition_season_id=?1 AND a.competition_ecosystem_id=?2 ORDER BY CASE WHEN a.role_type='PRIMARY_LEAGUE' THEN 0 ELSE 1 END, a.ecosystem_competition_assignment_id LIMIT 1",
        (competition_season_id, ecosystem_id),
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, Option<String>>(3)?, row.get::<_, Option<String>>(4)?)),
    ).map_err(|error| format!("Unable to load World DB bootstrap competition context: {error}"))?;
    let (competition_id, competition_name, ecosystem_name, ecosystem_gender, competition_gender) =
        context;
    let gender = gender_from_ecosystem(
        competition_gender
            .as_deref()
            .or(ecosystem_gender.as_deref()),
    );
    let season = query_season(&connection, competition_season_id)?;
    let mut teams = query_teams(&connection, ecosystem_id, &gender)?;
    // A universe generated for some competitions only: ecosystem members that have no players at
    // all were not generated and are not part of this world. A team with 1-4 players still fails.
    let generated = teams_with_players(&connection, &teams)?;
    if generated.len() >= 2 && generated.len() < teams.len() {
        teams.retain(|team| generated.contains(&team.team_id));
    }
    if teams.len() < 2 {
        return Err(
            "World DB bootstrap ecosystem membership requires at least two teams".to_owned(),
        );
    }
    let team_ids: Vec<String> = teams.iter().map(|team| team.team_id.clone()).collect();
    let mut organization_ids_set =
        BTreeSet::from_iter(teams.iter().map(|team| team.organization_id.clone()));
    let selected_organization_ids: Vec<String> = organization_ids_set.iter().cloned().collect();
    let organization_investor_interest =
        query_organization_investor_interest(&connection, &selected_organization_ids)?;
    let organization_ownership =
        query_organization_ownership(&connection, &selected_organization_ids)?;
    for interest in &organization_investor_interest {
        if interest.investor_kind == "ORGANIZATION" {
            organization_ids_set.insert(interest.investor_id.clone());
        }
    }
    for ownership in &organization_ownership {
        if ownership.owner_kind == "ORGANIZATION" {
            organization_ids_set.insert(ownership.owner_id.clone());
        }
    }
    let organization_ids: Vec<String> = organization_ids_set.into_iter().collect();
    let organization_section_ids: Vec<String> = BTreeSet::from_iter(
        teams
            .iter()
            .map(|team| team.organization_section_id.clone()),
    )
    .into_iter()
    .collect();
    let organizations = query_organizations(&connection, &organization_ids)?;
    let organization_sections =
        query_organization_sections(&connection, &organization_section_ids)?;
    if organizations.len() != organization_ids.len()
        || organization_sections.len() != organization_section_ids.len()
    {
        return Err(
            "World DB team references a missing Organization or OrganizationSection".to_owned(),
        );
    }
    let roster_assignments = query_roster_assignments(&connection, &team_ids, &season.season_id)?;
    if roster_assignments.is_empty() {
        return Err("World DB bootstrap ecosystem has no canonical roster assignments".to_owned());
    }
    let player_ids: Vec<String> = roster_assignments
        .iter()
        .map(|row| row.player_id.clone())
        .collect();
    if BTreeSet::<String>::from_iter(player_ids.iter().cloned()).len() != player_ids.len() {
        return Err(
            "World DB bootstrap player is assigned to more than one selected roster".to_owned(),
        );
    }
    let (staff_assignments, unmapped_staff_assignments) =
        query_staff_assignments(&connection, &team_ids, &season.start_date)?;
    validate_head_coaches(&staff_assignments, &team_ids)?;
    let staff_ids: Vec<String> = staff_assignments
        .iter()
        .map(|row| row.staff_id.clone())
        .collect();
    let staff_ids: Vec<String> = BTreeSet::from_iter(staff_ids).into_iter().collect();
    let mut persons = Vec::new();
    let mut players = Vec::new();
    let mut required_person_ids = BTreeSet::from_iter(player_ids.iter().cloned());
    for staff_id in staff_ids.iter() {
        let person_id = staff_id
            .strip_prefix("staff:")
            .ok_or_else(|| format!("World DB Staff profile has invalid identity: {staff_id}"))?;
        required_person_ids.insert(person_id.to_owned());
    }
    for ownership in &organization_ownership {
        if ownership.owner_kind == "PERSON" {
            required_person_ids.insert(ownership.owner_id.clone());
        }
    }
    for interest in &organization_investor_interest {
        if interest.investor_kind == "PERSON" {
            required_person_ids.insert(interest.investor_id.clone());
        }
    }
    for person_id in required_person_ids.iter() {
        let person = query_person(&connection, person_id)?;
        persons.push(person);
        if player_ids.iter().any(|player_id| player_id == person_id) {
            players.push(query_player(&connection, person_id)?);
        }
    }
    let mut staff_profiles = Vec::new();
    for staff_id in staff_ids.iter() {
        let person_id = staff_id
            .strip_prefix("staff:")
            .ok_or_else(|| format!("World DB Staff profile has invalid identity: {staff_id}"))?;
        staff_profiles.push(query_staff(&connection, person_id)?);
    }
    persons.sort_by(|a, b| a.person_id.cmp(&b.person_id));
    let countries = query_countries(&connection, &teams, &persons)?;
    let matches = query_matches(&connection, competition_season_id)?;
    let physical_content = crate::world_db_facilities::load(&connection, &team_ids)?;
    let contracts = query_contracts(
        &connection,
        &players,
        &staff_profiles,
        &roster_assignments,
        &staff_assignments,
        &teams,
    )?;
    let finance = query_finance(&connection, &organization_ids)?;
    let professionals = query_professionals(&connection, &organization_ids, &player_ids)?;
    Ok(WorldDbGameBootstrapSliceV1 {
        physical_content,
        schema_version: 1,
        source: WorldDbGameBootstrapSourceV1 {
            database_id: path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("bdm-world.db")
                .to_owned(),
            schema_id: WORLD_DB_SCHEMA_ID.to_owned(),
        },
        ecosystem: WorldDbGameBootstrapEcosystemV1 {
            ecosystem_id: ecosystem_id.to_owned(),
            name: ecosystem_name.clone(),
            kind: ecosystem_kind(&ecosystem_name),
            category: if gender == "female" {
                "women".to_owned()
            } else {
                "men".to_owned()
            },
        },
        competition: WorldDbGameBootstrapCompetitionV1 {
            competition_id,
            name: competition_name,
            gender,
            ecosystem_id: ecosystem_id.to_owned(),
        },
        season,
        countries,
        organizations,
        organization_sections,
        organization_ownership,
        organization_investor_interest,
        teams,
        persons,
        players,
        staff_profiles,
        staff_assignments,
        roster_assignments,
        matches,
        unmapped_staff_assignments,
        contracts,
        finance,
        professionals,
    })
}

fn has_table(connection: &Connection, name: &str) -> bool {
    connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            [name],
            |row| row.get::<_, i64>(0),
        )
        .map(|n| n > 0)
        .unwrap_or(false)
}

fn teams_with_players(
    connection: &Connection,
    teams: &[WorldDbGameBootstrapTeamV1],
) -> Result<BTreeSet<String>, String> {
    let mut found = BTreeSet::new();
    let mut statement = connection.prepare("SELECT COUNT(*) FROM roster r JOIN roster_membership rm ON rm.roster_id=r.roster_id WHERE r.team_id=?1 AND UPPER(r.roster_type_code)='PRIMARY_TEAM' AND UPPER(r.status)='ACTIVE' AND r.valid_to IS NULL AND UPPER(rm.membership_type_code)='PLAYER' AND UPPER(rm.roster_status_code)='ACTIVE' AND rm.valid_to IS NULL").map_err(|error| format!("Unable to prepare World DB generated-team query: {error}"))?;
    for team in teams {
        let count: i64 = statement
            .query_row([&team.team_id], |row| row.get(0))
            .map_err(|error| format!("Unable to count World DB team players: {error}"))?;
        if count > 0 {
            found.insert(team.team_id.clone());
        }
    }
    Ok(found)
}

fn cents(value: f64) -> i64 {
    (value * 100.0).round() as i64
}

/// Employment contracts of the loaded players and staff. Absent contract tables mean "none".
fn query_contracts(
    connection: &Connection,
    players: &[WorldDbGameBootstrapPlayerV1],
    staff: &[WorldDbGameBootstrapStaffV1],
    rosters: &[WorldDbGameBootstrapRosterAssignmentV1],
    staff_assignments: &[WorldDbGameBootstrapStaffAssignmentV1],
    teams: &[WorldDbGameBootstrapTeamV1],
) -> Result<Vec<WorldDbContractV1>, String> {
    if !(has_table(connection, "contract")
        && has_table(connection, "contract_party")
        && has_table(connection, "contract_compensation_term"))
    {
        return Ok(Vec::new());
    }
    let team_of_player: BTreeMap<&str, &str> = rosters
        .iter()
        .map(|r| (r.player_id.as_str(), r.team_id.as_str()))
        .collect();
    let team_of_staff: BTreeMap<String, &str> = staff_assignments
        .iter()
        .map(|a| (a.staff_id.clone(), a.team_id.as_str()))
        .collect();
    let mut people: BTreeMap<String, (&str, &str)> = BTreeMap::new();
    for player in players {
        if let Some(team) = team_of_player.get(player.person_id.as_str()) {
            people.insert(player.person_id.clone(), ("PLAYER", team));
        }
    }
    for member in staff {
        if let Some(team) = team_of_staff.get(&member.staff_id) {
            people.insert(member.person_id.clone(), ("STAFF", team));
        }
    }
    let organization_of_team: BTreeMap<&str, &str> = teams
        .iter()
        .map(|t| (t.team_id.as_str(), t.organization_id.as_str()))
        .collect();
    let mut contract_statement = connection.prepare("SELECT c.contract_id,c.status,c.signed_on,c.effective_from,c.effective_to,c.currency_code,pe.party_id FROM contract_party pp JOIN contract c ON c.contract_id=pp.contract_id JOIN contract_party pe ON pe.contract_id=c.contract_id AND pe.party_role='EMPLOYER' AND pe.party_kind='ORGANIZATION' WHERE pp.party_role='EMPLOYEE' AND pp.party_kind='PERSON' AND pp.party_id=?1 AND UPPER(c.status)='ACTIVE' ORDER BY c.contract_id").map_err(|error| format!("Unable to prepare World DB contract query: {error}"))?;
    let mut term_statement = connection.prepare("SELECT season_label,term_type,amount,COALESCE(guaranteed_amount,0) FROM contract_compensation_term WHERE contract_id=?1 ORDER BY season_label,term_type").map_err(|error| format!("Unable to prepare World DB contract term query: {error}"))?;
    let mut out = Vec::new();
    for (person_id, (kind, team_id)) in &people {
        let rows = contract_statement
            .query_map([person_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            })
            .map_err(|error| format!("Unable to query World DB contracts: {error}"))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| format!("Unable to decode World DB contract: {error}"))?;
        for (contract_id, status, signed_on, from, to, currency, organization) in rows {
            if organization_of_team.get(team_id) != Some(&organization.as_str()) {
                return Err(format!(
                    "World DB contract employer is not the organization of the team: {contract_id}"
                ));
            }
            let terms = term_statement
                .query_map([&contract_id], |row| {
                    Ok(WorldDbContractTermV1 {
                        season_label: row.get(0)?,
                        term_type: row.get(1)?,
                        amount_cents: cents(row.get::<_, f64>(2)?),
                        guaranteed_cents: cents(row.get::<_, f64>(3)?),
                    })
                })
                .map_err(|error| format!("Unable to query World DB contract terms: {error}"))?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|error| format!("Unable to decode World DB contract term: {error}"))?;
            out.push(WorldDbContractV1 {
                contract_id,
                kind: (*kind).to_owned(),
                person_id: person_id.clone(),
                organization_id: organization,
                team_id: (*team_id).to_owned(),
                status,
                signed_on,
                effective_from: from,
                effective_to: to,
                currency_code: currency,
                terms,
            });
        }
    }
    Ok(out)
}

/// Opening cash (cash account postings), budgets, revenue streams and commitments per organization.
fn query_finance(
    connection: &Connection,
    organization_ids: &[String],
) -> Result<Vec<WorldDbOrganizationFinanceV1>, String> {
    if !has_table(connection, "financial_account") {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for organization in organization_ids {
        let account: Option<(String, String, String)> = connection.query_row("SELECT financial_account_id,currency_code,COALESCE(opened_on,'') FROM financial_account WHERE owner_kind='ORGANIZATION' AND owner_id=?1 AND account_type LIKE '%CASH' AND closed_on IS NULL ORDER BY financial_account_id LIMIT 1", [organization], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).optional().map_err(|error| format!("Unable to query World DB cash account: {error}"))?;
        let Some((account_id, currency, opened_on)) = account else {
            continue;
        };
        let opening: Option<f64> = if has_table(connection, "financial_posting") {
            connection.query_row("SELECT SUM(CASE WHEN UPPER(direction)='DEBIT' THEN amount ELSE -amount END) FROM financial_posting WHERE financial_account_id=?1", [&account_id], |row| row.get(0)).map_err(|error| format!("Unable to query World DB cash postings: {error}"))?
        } else {
            None
        };
        let budgets = if has_table(connection, "budget") {
            let mut statement = connection.prepare("SELECT budget_type,season_label,amount FROM budget WHERE owner_kind='ORGANIZATION' AND owner_id=?1 ORDER BY season_label,budget_type").map_err(|error| format!("Unable to prepare World DB budget query: {error}"))?;
            let rows = statement
                .query_map([organization], |row| {
                    Ok(WorldDbBudgetV1 {
                        budget_type: row.get(0)?,
                        season_label: row.get(1)?,
                        amount_cents: cents(row.get::<_, f64>(2)?),
                    })
                })
                .map_err(|error| format!("Unable to query World DB budgets: {error}"))?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|error| format!("Unable to decode World DB budget: {error}"))?;
            rows
        } else {
            Vec::new()
        };
        let revenue_streams = if has_table(connection, "revenue_stream") {
            let mut statement = connection.prepare("SELECT stream_type,expected_annual_amount FROM revenue_stream WHERE organization_id=?1 ORDER BY stream_type").map_err(|error| format!("Unable to prepare World DB revenue query: {error}"))?;
            let rows = statement
                .query_map([organization], |row| {
                    Ok(WorldDbRevenueStreamV1 {
                        stream_type: row.get(0)?,
                        annual_amount_cents: cents(row.get::<_, f64>(1)?),
                    })
                })
                .map_err(|error| format!("Unable to query World DB revenue streams: {error}"))?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|error| format!("Unable to decode World DB revenue stream: {error}"))?;
            rows
        } else {
            Vec::new()
        };
        let commitments: f64 = if has_table(connection, "expense_commitment") {
            connection.query_row("SELECT COALESCE(SUM(expected_annual_amount),0) FROM expense_commitment WHERE organization_id=?1", [organization], |row| row.get(0)).map_err(|error| format!("Unable to query World DB commitments: {error}"))?
        } else {
            0.0
        };
        out.push(WorldDbOrganizationFinanceV1 {
            organization_id: organization.clone(),
            currency_code: currency,
            opening_cash_cents: opening.map(cents),
            opening_on: if opened_on.is_empty() {
                None
            } else {
                Some(opened_on)
            },
            budgets,
            revenue_streams,
            annual_expense_commitments_cents: cents(commitments),
        });
    }
    Ok(out)
}

fn count_table(connection: &Connection, table: &str) -> i64 {
    if !has_table(connection, table) {
        return 0;
    }
    connection
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .unwrap_or(0)
}

fn query_professionals(
    connection: &Connection,
    organization_ids: &[String],
    player_ids: &[String],
) -> Result<WorldDbProfessionalsV1, String> {
    let mut executives = Vec::new();
    for organization in organization_ids {
        let mut statement = connection.prepare("SELECT assignment_id,person_id,organization_id,role_code FROM staff_role_assignment WHERE organization_id=?1 AND team_id IS NULL AND UPPER(assignment_status_code)='ACTIVE' AND ended_on IS NULL ORDER BY role_code,assignment_id").map_err(|error| format!("Unable to prepare World DB executive query: {error}"))?;
        let rows = statement
            .query_map([organization], |row| {
                Ok(WorldDbExecutiveV1 {
                    assignment_id: row.get(0)?,
                    person_id: row.get(1)?,
                    organization_id: row.get(2)?,
                    role_code: row.get(3)?,
                })
            })
            .map_err(|error| format!("Unable to query World DB executives: {error}"))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| format!("Unable to decode World DB executive: {error}"))?;
        executives.extend(rows);
    }
    let mut agent_representations = Vec::new();
    if has_table(connection, "agent_representation") {
        let mut statement = connection.prepare("SELECT agent_person_id,client_person_id,representation_status_code FROM agent_representation WHERE client_person_id=?1 ORDER BY agent_person_id").map_err(|error| format!("Unable to prepare World DB representation query: {error}"))?;
        for player in player_ids {
            let rows = statement
                .query_map([player], |row| {
                    Ok(WorldDbAgentRepresentationV1 {
                        agent_person_id: row.get(0)?,
                        client_person_id: row.get(1)?,
                        status: row.get(2)?,
                    })
                })
                .map_err(|error| format!("Unable to query World DB representations: {error}"))?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|error| format!("Unable to decode World DB representation: {error}"))?;
            agent_representations.extend(rows);
        }
    }
    Ok(WorldDbProfessionalsV1 {
        executives,
        agent_representations,
        agent_count: count_table(connection, "agent"),
        official_count: count_table(connection, "official"),
        media_count: count_table(connection, "media_person"),
    })
}

fn query_season(
    connection: &Connection,
    competition_season_id: &str,
) -> Result<WorldDbGameBootstrapSeasonV1, String> {
    let row = connection.query_row("SELECT cs.competition_season_id,cs.season_id,COALESCE(s.label,cs.season_id),cs.start_date,cs.end_date,s.start_date,s.end_date FROM competition_season cs LEFT JOIN season s ON s.season_id=cs.season_id WHERE cs.competition_season_id=?1", [competition_season_id], |row| Ok((row.get::<_, String>(0)?,row.get::<_, String>(1)?,row.get::<_, String>(2)?,row.get::<_, Option<String>>(3)?,row.get::<_, Option<String>>(4)?,row.get::<_, Option<String>>(5)?,row.get::<_, Option<String>>(6)?))).map_err(|error| format!("Unable to load World DB bootstrap season {competition_season_id}: {error}"))?;
    let (id, season_id, label, cs_start, cs_end, season_start, season_end) = row;
    let (start_date, end_date, provenance) =
        match (cs_start.or(season_start), cs_end.or(season_end)) {
            (Some(start), Some(end)) => (start, end, "WORLD_DB".to_owned()),
            _ => {
                let (start, end) = derive_season_window(&label)?;
                (start, end, "DERIVED_SIMULATION_FROM_B04".to_owned())
            }
        };
    Ok(WorldDbGameBootstrapSeasonV1 {
        competition_season_id: id,
        season_id,
        label,
        start_date,
        end_date,
        provenance,
    })
}

fn derive_season_window(label: &str) -> Result<(String, String), String> {
    let parts: Vec<&str> = label.split('-').collect();
    if parts.len() != 2 {
        return Err(format!(
            "World DB season has no dates and its label is not a YYYY-YY season: {label}"
        ));
    }
    let start_year: i32 = parts[0]
        .parse()
        .map_err(|_| format!("World DB season label has invalid start year: {label}"))?;
    let short_end: i32 = parts[1]
        .parse()
        .map_err(|_| format!("World DB season label has invalid end year: {label}"))?;
    let end_year = if short_end < 100 {
        (start_year / 100) * 100 + short_end
    } else {
        short_end
    };
    Ok((
        format!("{start_year:04}-10-01"),
        format!("{end_year:04}-06-30"),
    ))
}

fn query_teams(
    connection: &Connection,
    ecosystem_id: &str,
    expected_gender: &str,
) -> Result<Vec<WorldDbGameBootstrapTeamV1>, String> {
    let mut statement = connection.prepare("SELECT DISTINCT t.team_id,e.canonical_name,t.gender,t.country_place_id,t.organization_id,t.section_id FROM team_ecosystem_membership m JOIN team t ON t.team_id=m.team_id JOIN entity e ON e.entity_id=t.entity_id WHERE m.competition_ecosystem_id=?1 AND UPPER(m.membership_status)='ACTIVE' AND m.valid_to IS NULL ORDER BY t.team_id").map_err(|error| format!("Unable to prepare World DB ecosystem team query: {error}"))?;
    let rows = statement
        .query_map([ecosystem_id], |row| {
            Ok(WorldDbGameBootstrapTeamV1 {
                team_id: row.get(0)?,
                name: row.get(1)?,
                gender: gender_from_ecosystem(row.get::<_, Option<String>>(2)?.as_deref()),
                country_id: row.get(3)?,
                organization_id: row.get(4)?,
                organization_section_id: row.get(5)?,
            })
        })
        .map_err(|error| format!("Unable to query World DB ecosystem teams: {error}"))?;
    let teams = rows
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB ecosystem team: {error}"))?;
    if teams.iter().any(|team| team.gender != expected_gender) {
        return Err(
            "World DB ecosystem membership contains a team with a different gender".to_owned(),
        );
    }
    Ok(teams)
}

fn query_organizations(
    connection: &Connection,
    ids: &[String],
) -> Result<Vec<WorldDbGameBootstrapOrganizationV1>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let sql = format!("SELECT organization_id,entity_id,legal_name,founded_year,dissolved_year,primary_place_id,website FROM organization WHERE organization_id IN ({}) ORDER BY organization_id", placeholders_from(1, ids.len()));
    let owned = ids.to_vec();
    let params: Vec<&dyn rusqlite::ToSql> = owned
        .iter()
        .map(|value| value as &dyn rusqlite::ToSql)
        .collect();
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| format!("Unable to prepare World DB organization query: {error}"))?;
    let rows = statement
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(WorldDbGameBootstrapOrganizationV1 {
                organization_id: row.get(0)?,
                entity_id: row.get(1)?,
                legal_name: row.get(2)?,
                founded_year: row.get(3)?,
                dissolved_year: row.get(4)?,
                primary_place_id: row.get(5)?,
                website: row.get(6)?,
            })
        })
        .map_err(|error| format!("Unable to query World DB organizations: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB organization: {error}"))
}

fn query_organization_sections(
    connection: &Connection,
    ids: &[String],
) -> Result<Vec<WorldDbGameBootstrapOrganizationSectionV1>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let sql = format!("SELECT section_id,organization_id,sport,gender,category_scope,COALESCE(canonical_name,section_id),valid_from,valid_to FROM organization_section WHERE section_id IN ({}) ORDER BY section_id", placeholders_from(1, ids.len()));
    let owned = ids.to_vec();
    let params: Vec<&dyn rusqlite::ToSql> = owned
        .iter()
        .map(|value| value as &dyn rusqlite::ToSql)
        .collect();
    let mut statement = connection.prepare(&sql).map_err(|error| {
        format!("Unable to prepare World DB organization-section query: {error}")
    })?;
    let rows = statement
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(WorldDbGameBootstrapOrganizationSectionV1 {
                section_id: row.get(0)?,
                organization_id: row.get(1)?,
                sport: row.get(2)?,
                gender: row.get(3)?,
                category_scope: row.get(4)?,
                canonical_name: row.get(5)?,
                valid_from: row.get(6)?,
                valid_to: row.get(7)?,
            })
        })
        .map_err(|error| format!("Unable to query World DB organization sections: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB organization section: {error}"))
}

fn query_organization_ownership(
    connection: &Connection,
    organization_ids: &[String],
) -> Result<Vec<WorldDbGameBootstrapOrganizationOwnershipV1>, String> {
    if organization_ids.is_empty() {
        return Ok(Vec::new());
    }
    let sql = format!("SELECT organization_ownership_id,organization_id,owner_kind,owner_id,ownership_percentage,valid_from,valid_to FROM organization_ownership WHERE organization_id IN ({}) ORDER BY organization_ownership_id", placeholders_from(1, organization_ids.len()));
    let params: Vec<&dyn rusqlite::ToSql> = organization_ids
        .iter()
        .map(|value| value as &dyn rusqlite::ToSql)
        .collect();
    let mut statement = connection.prepare(&sql).map_err(|error| {
        format!("Unable to prepare World DB organization ownership query: {error}")
    })?;
    let rows = statement
        .query_map(rusqlite::params_from_iter(params), |row| {
            let raw_kind: String = row.get(2)?;
            let owner_kind = match raw_kind.to_ascii_uppercase().as_str() {
                "PERSON" => "PERSON".to_owned(),
                "ORGANIZATION" => "ORGANIZATION".to_owned(),
                _ => {
                    return Err(rusqlite::Error::FromSqlConversionFailure(
                        2,
                        rusqlite::types::Type::Text,
                        Box::new(std::io::Error::new(
                            std::io::ErrorKind::InvalidData,
                            format!("unsupported organization ownership owner_kind: {raw_kind}"),
                        )),
                    ))
                }
            };
            Ok(WorldDbGameBootstrapOrganizationOwnershipV1 {
                ownership_id: row.get(0)?,
                organization_id: row.get(1)?,
                owner_kind,
                owner_id: row.get(3)?,
                ownership_percentage: row.get(4)?,
                valid_from: row.get(5)?,
                valid_to: row.get(6)?,
            })
        })
        .map_err(|error| format!("Unable to query World DB organization ownership: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB organization ownership: {error}"))
}

fn query_organization_investor_interest(
    connection: &Connection,
    organization_ids: &[String],
) -> Result<Vec<WorldDbGameBootstrapOrganizationInvestorInterestV1>, String> {
    if organization_ids.is_empty() {
        return Ok(Vec::new());
    }
    let sql = format!("SELECT investor_interest_id,organization_id,investor_kind,investor_id,interest_type,status,opened_on,closed_on FROM organization_investor_interest WHERE organization_id IN ({}) ORDER BY investor_interest_id", placeholders_from(1, organization_ids.len()));
    let params: Vec<&dyn rusqlite::ToSql> = organization_ids
        .iter()
        .map(|value| value as &dyn rusqlite::ToSql)
        .collect();
    let mut statement = connection.prepare(&sql).map_err(|error| {
        format!("Unable to prepare World DB organization investor interest query: {error}")
    })?;
    let rows = statement
        .query_map(rusqlite::params_from_iter(params), |row| {
            let raw_kind: String = row.get(2)?;
            let investor_kind = match raw_kind.to_ascii_uppercase().as_str() {
                "PERSON" => "PERSON".to_owned(),
                "ORGANIZATION" => "ORGANIZATION".to_owned(),
                _ => return Err(unsupported_organization_investor_kind(raw_kind)),
            };
            Ok(WorldDbGameBootstrapOrganizationInvestorInterestV1 {
                interest_id: row.get(0)?,
                organization_id: row.get(1)?,
                investor_kind,
                investor_id: row.get(3)?,
                interest_type: row.get(4)?,
                status: row.get(5)?,
                opened_on: row.get(6)?,
                closed_on: row.get(7)?,
            })
        })
        .map_err(|error| {
            format!("Unable to query World DB organization investor interest: {error}")
        })?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|error| {
        format!("Unable to decode World DB organization investor interest: {error}")
    })
}

fn unsupported_organization_investor_kind(raw_kind: String) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        2,
        rusqlite::types::Type::Text,
        Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("unsupported organization investor interest investor_kind: {raw_kind}"),
        )),
    )
}

fn query_roster_assignments(
    connection: &Connection,
    team_ids: &[String],
    season_id: &str,
) -> Result<Vec<WorldDbGameBootstrapRosterAssignmentV1>, String> {
    let csv = placeholders(team_ids.len());
    let sql = format!("WITH selected AS (SELECT r.roster_id,r.team_id,ROW_NUMBER() OVER (PARTITION BY r.team_id ORDER BY CASE WHEN r.season_id=?1 THEN 0 ELSE 1 END,r.valid_from DESC,r.roster_id) AS rn FROM roster r WHERE r.team_id IN ({csv}) AND UPPER(r.roster_type_code)='PRIMARY_TEAM' AND UPPER(r.status)='ACTIVE' AND r.valid_to IS NULL) SELECT s.roster_id,s.team_id,rm.person_id,rm.roster_status_code FROM selected s JOIN roster_membership rm ON rm.roster_id=s.roster_id WHERE s.rn=1 AND UPPER(rm.membership_type_code)='PLAYER' AND UPPER(rm.roster_status_code)='ACTIVE' AND rm.valid_to IS NULL ORDER BY s.team_id,rm.person_id");
    let season_id_owned = season_id.to_owned();
    let mut params: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(team_ids.len() + 1);
    params.push(&season_id_owned);
    let owned = team_ids.to_vec();
    for value in &owned {
        params.push(value);
    }
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| format!("Unable to prepare World DB canonical roster query: {error}"))?;
    let rows = statement
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(WorldDbGameBootstrapRosterAssignmentV1 {
                roster_id: row.get(0)?,
                team_id: row.get(1)?,
                player_id: row.get(2)?,
                status: row.get(3)?,
            })
        })
        .map_err(|error| {
            format!("Unable to query World DB canonical roster memberships: {error}")
        })?;
    let assignments = rows
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB roster membership: {error}"))?;
    for team_id in team_ids {
        let count = assignments
            .iter()
            .filter(|row| &row.team_id == team_id)
            .count();
        if count < 5 {
            return Err(format!(
                "World DB canonical roster has fewer than five active players: {team_id}"
            ));
        }
    }
    Ok(assignments)
}

fn query_person(
    connection: &Connection,
    person_id: &str,
) -> Result<WorldDbGameBootstrapPersonV1, String> {
    let (sex, date_of_birth) = connection
        .query_row(
            "SELECT sex,birth_date FROM person WHERE person_id=?1",
            [person_id],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                ))
            },
        )
        .map_err(|error| format!("Unable to load World DB person {person_id}: {error}"))?;
    let (first_name, last_name) = connection.query_row("SELECT given_name,family_name FROM person_name WHERE person_id=?1 AND valid_to IS NULL ORDER BY is_primary DESC,is_preferred DESC,person_name_id LIMIT 1", [person_id], |row| Ok((row.get::<_, String>(0)?,row.get::<_, String>(1)?))).map_err(|error| format!("Unable to load World DB primary name {person_id}: {error}"))?;
    let nationalities = query_string_column(connection, "SELECT place_id FROM person_nationality WHERE person_id=?1 AND valid_to IS NULL ORDER BY is_primary DESC,person_nationality_id", person_id)?;
    let physical = connection.query_row("SELECT height_cm,weight_kg,wingspan_cm,standing_reach_cm FROM person_physical_snapshot WHERE person_id=?1 ORDER BY effective_date DESC,physical_snapshot_id DESC LIMIT 1", [person_id], |row| Ok((row.get::<_, Option<f64>>(0)?, row.get::<_, Option<f64>>(1)?, row.get::<_, Option<f64>>(2)?, row.get::<_, Option<f64>>(3)?))).optional().map_err(|error| format!("Unable to load World DB physical snapshot {person_id}: {error}"))?.and_then(|(height_cm, weight_kg, wingspan_cm, standing_reach_cm)| Some(WorldDbGameBootstrapPersonPhysicalV1 { height_cm: height_cm?, weight_kg: weight_kg?, wingspan_cm: wingspan_cm?, standing_reach_cm: standing_reach_cm? }));
    let personality = query_person_runtime_personality(connection, person_id)?;
    Ok(WorldDbGameBootstrapPersonV1 {
        person_id: person_id.to_owned(),
        first_name,
        last_name,
        gender: sex
            .as_deref()
            .map(|value| gender_from_ecosystem(Some(value))),
        date_of_birth,
        nationality_ids: nationalities,
        physical,
        personality,
    })
}

/// Opt-in native WorldDB PERSON -> eight-key BDM runtime projection.
/// A legacy DB with no table or old P_01..P_50 keys keeps its normal
/// in-game fallback. A partial *semantic* profile is an error, never silently
/// completed with pseudo-random values.
fn query_person_runtime_personality(
    connection: &Connection,
    person_id: &str,
) -> Result<Option<BTreeMap<String, u8>>, String> {
    const RUNTIME_KEYS: [&str; 8] = [
        "ambition",
        "professionalism",
        "loyalty",
        "resilience",
        "temperament",
        "teamOrientation",
        "adaptability",
        "competitiveness",
    ];
    const SEMANTIC_KEYS: [&str; 50] = [
        "ambition",
        "competitiveness",
        "achievementDrive",
        "statusSeeking",
        "persistence",
        "goalFocus",
        "recognitionNeed",
        "professionalism",
        "discipline",
        "preparation",
        "conscientiousness",
        "workEthic",
        "accountability",
        "coachability",
        "loyalty",
        "fairness",
        "integrity",
        "reciprocity",
        "contractualCommitment",
        "honesty",
        "resilience",
        "temperament",
        "stressTolerance",
        "impulseControl",
        "emotionalStability",
        "frustrationTolerance",
        "composure",
        "teamOrientation",
        "empathy",
        "communication",
        "leadership",
        "trust",
        "conflictResolution",
        "adaptability",
        "curiosity",
        "learningOrientation",
        "flexibility",
        "culturalOpenness",
        "uncertaintyTolerance",
        "riskAppetite",
        "decisionPatience",
        "decisiveness",
        "tacticalAwareness",
        "selfReflection",
        "mediaComfort",
        "privacyPreference",
        "socialConfidence",
        "publicResponsibility",
        "controversyTolerance",
        "humor",
    ];
    let exists: Option<i64> = connection
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='person_personality_value'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("World DB personality table inspection failed: {e}"))?;
    if exists.is_none() {
        return Ok(None);
    }
    let mut statement = connection
        .prepare("SELECT dimension_code,value FROM person_personality_value WHERE person_id=?1")
        .map_err(|e| format!("World DB personality query failed for {person_id}: {e}"))?;
    let rows = statement
        .query_map([person_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| format!("World DB personality read failed for {person_id}: {e}"))?;
    let mut values = BTreeMap::new();
    for row in rows {
        let (code, raw) =
            row.map_err(|e| format!("World DB personality invalid for {person_id}: {e}"))?;
        if SEMANTIC_KEYS.contains(&code.as_str()) {
            let value = u8::try_from(raw).map_err(|_| {
                format!("World DB personality {code} invalid for {person_id}: {raw}")
            })?;
            if value > 100 {
                return Err(format!(
                    "World DB personality {code} out of 0..100 for {person_id}"
                ));
            }
            values.insert(code, value);
        }
    }
    if values.is_empty() {
        return Ok(None);
    }
    if !RUNTIME_KEYS.iter().all(|key| values.contains_key(*key)) {
        return Err(format!(
            "World DB PERSON {person_id} has partial BDM runtime personality: {}/8",
            RUNTIME_KEYS
                .iter()
                .filter(|key| values.contains_key(**key))
                .count()
        ));
    }
    if values.len() != 8 && values.len() != SEMANTIC_KEYS.len() {
        return Err(format!(
            "World DB PERSON {person_id} has partial semantic personality: {}/50",
            values.len()
        ));
    }
    Ok(Some(values))
}

// DDL-12 2.4-D2 is opt-in. Detect all three companion tables together.
// Missing tables mean no verified repertoire, not fictional zero scores.
fn query_player_repertoire(
    connection: &Connection,
    person_id: &str,
) -> Result<Option<WorldDbPlayerRepertoireV1>, String> {
    const VERSION: &str = "PLAYER-2.4-D1-40-TRAITS-60-MOVES-V1";
    let table_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN
             ('player_trait_strength_24d','player_move_usage_24d','player_move_family_24d')",
            [],
            |row| row.get(0),
        )
        .map_err(|error| format!("WorldDB repertoire schema inspection failed: {error}"))?;
    if table_count == 0 {
        return Ok(None);
    }
    if table_count != 3 {
        return Err(
            "WorldDB has a partially installed PLAYER 2.4-D2 repertoire extension".to_owned(),
        );
    }

    let mut traits_query = connection
        .prepare(
            "SELECT s.player_trait_code,s.strength,s.started_on,s.repertoire_version,a.person_id
         FROM player_trait_strength_24d s
         LEFT JOIN player_trait_assignment a
           ON a.person_id=s.person_id AND a.player_trait_code=s.player_trait_code
          AND a.started_on=s.started_on
         WHERE s.person_id=?1 ORDER BY s.player_trait_code",
        )
        .map_err(|error| format!("WorldDB trait query preparation failed: {error}"))?;
    let traits = traits_query
        .query_map([person_id], |row| {
            Ok((
                WorldDbContextualTraitV1 {
                    code: row.get(0)?,
                    strength: row.get(1)?,
                    started_on: row.get(2)?,
                },
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })
        .map_err(|error| format!("WorldDB traits query failed: {error}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("WorldDB traits decode failed: {error}"))?;
    if traits.len() > 40
        || traits.iter().any(|(row, version, parent)| {
            version != VERSION
                || parent.is_none()
                || row.code.is_empty()
                || !(0..=100).contains(&row.strength)
                || row.started_on.is_empty()
        })
    {
        return Err("WorldDB contains unverified or malformed PLAYER contextual traits".to_owned());
    }
    let contextual_traits = traits
        .into_iter()
        .map(|(row, _, _)| row)
        .collect::<Vec<_>>();

    let mut moves_query = connection.prepare(
        "SELECT u.move_code,v.value,u.usage_tendency,u.as_of_on,u.repertoire_version,f.move_family
         FROM player_move_usage_24d u
         LEFT JOIN player_move_value v
           ON v.person_id=u.person_id AND v.move_code=u.move_code
         LEFT JOIN player_move_family_24d f ON f.move_code=u.move_code
         WHERE u.person_id=?1 ORDER BY u.move_code",
    ).map_err(|error| format!("WorldDB move query preparation failed: {error}"))?;
    let moves = moves_query
        .query_map([person_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })
        .map_err(|error| format!("WorldDB move query failed: {error}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("WorldDB move decode failed: {error}"))?;
    if moves.len() > 60
        || moves
            .iter()
            .any(|(code, proficiency, usage, date, version, family)| {
                code.is_empty()
                    || !proficiency.is_some_and(|score| (0..=100).contains(&score))
                    || !(0..=100).contains(usage)
                    || date.is_empty()
                    || version != VERSION
                    || family.as_deref().is_none_or(str::is_empty)
            })
    {
        return Err("WorldDB contains unverified or malformed PLAYER technical moves".to_owned());
    }
    let technical_moves = moves
        .into_iter()
        .map(
            |(code, proficiency, usage_tendency, as_of_on, _, _)| WorldDbTechnicalMoveV1 {
                code,
                proficiency: proficiency.expect("verified"),
                usage_tendency,
                as_of_on,
            },
        )
        .collect::<Vec<_>>();

    // Only the eight certified PLAYER 2.4-B specialization codes. Unversioned
    // legacy contextual traits must never be relabeled as specialization.
    let mut specialties_query = connection
        .prepare(
            "SELECT player_trait_code,started_on FROM player_trait_assignment
         WHERE person_id=?1 AND player_trait_code IN (
            'SHOOTING_GRAVITY','DEEP_RANGE_HUNTER','RIM_PROTECTION_INSTINCT',
            'GLASS_CLEANING_MOTOR','PLAYMAKING_VISION','PERIMETER_HARASSER',
            'ENDLESS_ENGINE','ABOVE_RIM_FINISHER')
         AND ended_on IS NULL ORDER BY player_trait_code",
        )
        .map_err(|error| format!("WorldDB specialty trait query preparation failed: {error}"))?;
    let basketball_specialization_traits = specialties_query
        .query_map([person_id], |row| {
            Ok(WorldDbBasketballSpecializationTraitV1 {
                code: row.get(0)?,
                started_on: row.get(1)?,
            })
        })
        .map_err(|error| format!("WorldDB specialties query failed: {error}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("WorldDB specialties decode failed: {error}"))?;
    if basketball_specialization_traits.len() > 8
        || basketball_specialization_traits
            .iter()
            .any(|row| row.started_on.is_empty())
    {
        return Err("WorldDB specialization traits are malformed".to_owned());
    }
    Ok(Some(WorldDbPlayerRepertoireV1 {
        version: VERSION.to_owned(),
        contextual_traits,
        technical_moves,
        basketball_specialization_traits,
    }))
}

fn query_player(
    connection: &Connection,
    person_id: &str,
) -> Result<WorldDbGameBootstrapPlayerV1, String> {
    let source_dominant_hand = connection
        .query_row(
            "SELECT dominant_hand FROM player WHERE person_id=?1",
            [person_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|error| format!("Unable to load World DB player {person_id}: {error}"))?;
    // The current runtime contract is binary. DDL-12's AMBIDEXTROUS value is a
    // source value, so use the documented neutral RIGHT compatibility projection.
    let dominant_hand = match source_dominant_hand.as_str() {
        "LEFT" => "LEFT",
        "RIGHT" | "AMBIDEXTROUS" => "RIGHT",
        _ => {
            return Err(format!(
                "World DB player has invalid dominant hand: {person_id}"
            ))
        }
    }
    .to_owned();
    let positions = query_positions(connection, person_id)?;
    if positions.is_empty() {
        return Err(format!("World DB player has no position: {person_id}"));
    }
    let primary_count = positions.iter().filter(|(_, primary, _)| *primary).count();
    if primary_count != 1 {
        return Err(format!(
            "World DB player must have exactly one primary position: {person_id}"
        ));
    }
    let primary_position = positions
        .iter()
        .find(|(_, primary, _)| *primary)
        .unwrap()
        .0
        .clone();
    let secondary_positions = positions
        .iter()
        .filter(|(_, primary, _)| !*primary)
        .map(|(code, _, _)| code.clone())
        .collect();
    // Preserve unmodified source familiarity. No numeric eligibility threshold.
    let position_familiarity = positions
        .into_iter()
        .map(|(code, _, familiarity)| (code, familiarity))
        .collect();
    let ratings = query_values(
        connection,
        "SELECT rating_code,value FROM player_rating_value WHERE person_id=?1 ORDER BY rating_code",
        person_id,
    )?;
    if ratings.len() != 80 {
        return Err(format!(
            "World DB player must have exactly 80 ratings: {person_id}"
        ));
    }
    let tendencies = query_values(connection, "SELECT tendency_code,value FROM player_tendency_value WHERE person_id=?1 ORDER BY tendency_code", person_id)?;
    if tendencies.len() != 40 {
        return Err(format!(
            "World DB player must have exactly 40 tendencies: {person_id}"
        ));
    }
    let mut statement = connection.prepare("SELECT dimension_code,ceiling,growth_rate,decline_sensitivity FROM player_development_profile WHERE person_id=?1 ORDER BY dimension_code").map_err(|error| format!("Unable to prepare World DB development query: {error}"))?;
    let rows = statement
        .query_map([person_id], |row| {
            Ok(WorldDbGameBootstrapDevelopmentDimensionV1 {
                dimension_code: row.get(0)?,
                ceiling: row.get(1)?,
                growth_rate: row.get(2)?,
                decline_sensitivity: row.get(3)?,
            })
        })
        .map_err(|error| format!("Unable to query World DB development profile: {error}"))?;
    let development = rows
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB development profile: {error}"))?;
    if development.len() != 8 {
        return Err(format!(
            "World DB player must have exactly 8 development dimensions: {person_id}"
        ));
    }
    Ok(WorldDbGameBootstrapPlayerV1 {
        player_id: person_id.to_owned(),
        person_id: person_id.to_owned(),
        primary_position,
        secondary_positions,
        position_familiarity,
        dominant_hand,
        ratings,
        tendencies,
        development,
        repertoire: query_player_repertoire(connection, person_id)?,
    })
}

fn query_positions(
    connection: &Connection,
    person_id: &str,
) -> Result<Vec<(String, bool, Option<f64>)>, String> {
    let mut statement = connection.prepare("SELECT position_code,is_primary,familiarity FROM player_position WHERE person_id=?1 ORDER BY is_primary DESC,familiarity DESC,position_code").map_err(|error| format!("Unable to prepare World DB position query: {error}"))?;
    let rows = statement
        .query_map([person_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)? != 0,
                row.get::<_, Option<f64>>(2)?,
            ))
        })
        .map_err(|error| format!("Unable to query World DB positions: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB position: {error}"))
}
fn query_values(
    connection: &Connection,
    sql: &str,
    person_id: &str,
) -> Result<BTreeMap<String, f64>, String> {
    let mut statement = connection
        .prepare(sql)
        .map_err(|error| format!("Unable to prepare World DB value query: {error}"))?;
    let rows = statement
        .query_map([person_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        })
        .map_err(|error| format!("Unable to query World DB values: {error}"))?;
    let values = rows
        .collect::<rusqlite::Result<BTreeMap<_, _>>>()
        .map_err(|error| format!("Unable to decode World DB value: {error}"))?;
    Ok(values)
}
fn query_string_column(
    connection: &Connection,
    sql: &str,
    id: &str,
) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare(sql)
        .map_err(|error| format!("Unable to prepare World DB string query: {error}"))?;
    let rows = statement
        .query_map([id], |row| row.get::<_, String>(0))
        .map_err(|error| format!("Unable to query World DB strings: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB string: {error}"))
}

type StaffAssignmentRows = (
    Vec<WorldDbGameBootstrapStaffAssignmentV1>,
    Vec<WorldDbUnmappedStaffAssignmentV1>,
);

fn query_staff_assignments(
    connection: &Connection,
    team_ids: &[String],
    assigned_on: &str,
) -> Result<StaffAssignmentRows, String> {
    let csv = placeholders(team_ids.len());
    let sql = format!("SELECT assignment_id,person_id,team_id,role_code,COALESCE(started_on,?1) FROM staff_role_assignment WHERE team_id IN ({csv}) AND UPPER(assignment_status_code)='ACTIVE' AND ended_on IS NULL ORDER BY team_id,role_code,assignment_id");
    let assigned_on_owned = assigned_on.to_owned();
    let mut params: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(team_ids.len() + 1);
    params.push(&assigned_on_owned);
    let owned = team_ids.to_vec();
    for value in &owned {
        params.push(value);
    }
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| format!("Unable to prepare World DB staff assignment query: {error}"))?;
    let rows = statement
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|error| format!("Unable to query World DB staff assignments: {error}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB staff assignment: {error}"))?;
    let mut mapped = Vec::new();
    let mut unmapped = Vec::new();
    for (assignment_id, person_id, team_id, role, assigned_on) in rows {
        match map_staff_role(&role) {
            Ok(role_code) => mapped.push(WorldDbGameBootstrapStaffAssignmentV1 {
                assignment_id,
                staff_id: format!("staff:{person_id}"),
                team_id,
                role_code,
                assigned_on,
            }),
            Err(()) => unmapped.push(WorldDbUnmappedStaffAssignmentV1 {
                assignment_id,
                person_id,
                team_id,
                role_code: role,
            }),
        }
    }
    Ok((mapped, unmapped))
}
fn query_staff(
    connection: &Connection,
    person_id: &str,
) -> Result<WorldDbGameBootstrapStaffV1, String> {
    let attributes = query_values(connection, "SELECT attribute_code,value FROM staff_attribute_value WHERE person_id=?1 ORDER BY attribute_code", person_id)?;
    if attributes.len() != 80 {
        return Err(format!(
            "World DB staff must have exactly 80 source attributes: {person_id}"
        ));
    }
    let specialism_ids = query_string_column(connection,"SELECT specialism_code FROM staff_specialism_assignment WHERE person_id=?1 ORDER BY specialism_code",person_id)?;
    Ok(WorldDbGameBootstrapStaffV1 {
        staff_id: format!("staff:{person_id}"),
        person_id: person_id.to_owned(),
        attributes,
        specialism_ids,
    })
}
fn validate_head_coaches(
    assignments: &[WorldDbGameBootstrapStaffAssignmentV1],
    team_ids: &[String],
) -> Result<(), String> {
    for team_id in team_ids {
        let count = assignments
            .iter()
            .filter(|row| &row.team_id == team_id && row.role_code == "headCoach")
            .count();
        if count != 1 {
            return Err(format!(
                "World DB team must have exactly one active HEAD_COACH: {team_id}"
            ));
        }
    }
    Ok(())
}
fn map_staff_role(role: &str) -> Result<String, ()> {
    Ok(match role {
        "HEAD_COACH" => "headCoach",
        "ASSISTANT_COACH" => "assistantCoach",
        "PHYSIOTHERAPIST" => "physiotherapist",
        "PLAYER_DEVELOPMENT_COACH" => "playerDevelopmentCoach",
        "SCOUT" => "regionalScout",
        "PERFORMANCE_COACH" => "performanceCoach",
        "TEAM_DOCTOR" => "teamDoctor",
        "DATA_ANALYST" => "analyticsStaff",
        "STRENGTH_CONDITIONING_COACH" => "strengthConditioningCoach",
        "RECRUITING_COORDINATOR" => "recruitingCoordinator",
        _ => return Err(()),
    }
    .to_owned())
}

fn query_countries(
    connection: &Connection,
    teams: &[WorldDbGameBootstrapTeamV1],
    persons: &[WorldDbGameBootstrapPersonV1],
) -> Result<Vec<WorldDbGameBootstrapCountryV1>, String> {
    let mut ids = BTreeSet::new();
    for team in teams {
        ids.insert(team.country_id.clone());
    }
    for person in persons {
        ids.extend(person.nationality_ids.iter().cloned());
    }
    ids.into_iter().map(|id| connection.query_row("SELECT p.place_id,COALESCE(e.canonical_name,p.country_code),p.country_code FROM place p LEFT JOIN entity e ON e.entity_id=p.entity_id WHERE p.place_id=?1", [&id], |row| Ok(WorldDbGameBootstrapCountryV1 { country_id:row.get(0)?,name:row.get(1)?,code:row.get(2)? })).map_err(|error| format!("Unable to resolve canonical country place {id}: {error}"))).collect()
}
fn query_matches(
    connection: &Connection,
    competition_season_id: &str,
) -> Result<Vec<WorldDbGameBootstrapMatchV1>, String> {
    let sql="SELECT DISTINCT m.match_id,m.scheduled_at,m.played_at,m.status,m.home_team_id,m.away_team_id,m.home_score,m.away_score FROM match m LEFT JOIN game_fixture_realization r ON r.match_id=m.match_id LEFT JOIN competition_fixture f ON f.competition_fixture_id=r.competition_fixture_id WHERE (m.competition_season_id=?1 OR f.competition_season_id=?1) AND UPPER(m.status) IN ('SCHEDULED','COMPLETED') ORDER BY m.match_id";
    let mut statement = connection
        .prepare(sql)
        .map_err(|error| format!("Unable to prepare World DB match query: {error}"))?;
    let rows = statement
        .query_map([competition_season_id], |row| {
            Ok(WorldDbGameBootstrapMatchV1 {
                match_id: row.get(0)?,
                scheduled_at: row.get(1)?,
                played_at: row.get(2)?,
                status: row.get(3)?,
                home_team_id: row.get(4)?,
                away_team_id: row.get(5)?,
                home_score: row.get(6)?,
                away_score: row.get(7)?,
            })
        })
        .map_err(|error| format!("Unable to query World DB matches: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB match: {error}"))
}
fn placeholders(count: usize) -> String {
    (1..=count)
        .map(|index| format!("?{}", index + 1))
        .collect::<Vec<_>>()
        .join(",")
}
fn placeholders_from(start: usize, count: usize) -> String {
    (start..start + count)
        .map(|index| format!("?{index}"))
        .collect::<Vec<_>>()
        .join(",")
}
fn gender_from_ecosystem(value: Option<&str>) -> String {
    if value.is_some_and(|value| {
        value.eq_ignore_ascii_case("F") || value.eq_ignore_ascii_case("FEMALE")
    }) {
        "female".to_owned()
    } else {
        "male".to_owned()
    }
}
fn ecosystem_kind(name: &str) -> String {
    let upper = name.to_ascii_uppercase();
    if upper.contains("NCAA") {
        "ncaaLike".to_owned()
    } else if upper.contains("NBA") {
        "nbaLike".to_owned()
    } else {
        "fibaLike".to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn player_repertoire_requires_complete_optional_ddl12_extension() {
        let connection = Connection::open_in_memory().unwrap();
        assert!(query_player_repertoire(&connection, "person:player")
            .unwrap()
            .is_none());
        connection.execute_batch(
            "CREATE TABLE player_trait_strength_24d(person_id TEXT,player_trait_code TEXT,started_on TEXT,strength INTEGER,repertoire_version TEXT);",
        ).unwrap();
        assert!(query_player_repertoire(&connection, "person:player")
            .unwrap_err()
            .contains("partially installed"));
    }

    #[test]
    fn player_repertoire_reads_only_verified_strength_move_usage_and_eight_specialties() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(
            "CREATE TABLE player_trait_strength_24d(person_id TEXT,player_trait_code TEXT,started_on TEXT,strength INTEGER,repertoire_version TEXT);
             CREATE TABLE player_trait_assignment(person_id TEXT,player_trait_code TEXT,started_on TEXT,ended_on TEXT);
             CREATE TABLE player_move_usage_24d(person_id TEXT,move_code TEXT,usage_tendency INTEGER,as_of_on TEXT,repertoire_version TEXT);
             CREATE TABLE player_move_value(person_id TEXT,move_code TEXT,value INTEGER);
             CREATE TABLE player_move_family_24d(move_code TEXT,move_family TEXT);
             INSERT INTO player_trait_assignment VALUES ('person:p','HIGH_MOTOR','2026-07-01',NULL),('person:p','SHOOTING_GRAVITY','2026-07-01',NULL);
             INSERT INTO player_trait_strength_24d VALUES ('person:p','HIGH_MOTOR','2026-07-01',86,'PLAYER-2.4-D1-40-TRAITS-60-MOVES-V1');
             INSERT INTO player_move_value VALUES ('person:p','STEPBACK',74);
             INSERT INTO player_move_usage_24d VALUES ('person:p','STEPBACK',32,'2026-07-01','PLAYER-2.4-D1-40-TRAITS-60-MOVES-V1');
             INSERT INTO player_move_family_24d VALUES ('STEPBACK','SEPARATION');",
        ).unwrap();
        let profile = query_player_repertoire(&connection, "person:p")
            .unwrap()
            .unwrap();
        assert_eq!(profile.contextual_traits.len(), 1);
        assert_eq!(profile.contextual_traits[0].code, "HIGH_MOTOR");
        assert_eq!(profile.contextual_traits[0].strength, 86);
        assert_eq!(profile.technical_moves.len(), 1);
        assert_eq!(profile.technical_moves[0].proficiency, 74);
        assert_eq!(profile.technical_moves[0].usage_tendency, 32);
        assert_eq!(profile.basketball_specialization_traits.len(), 1);
        assert_eq!(
            profile.basketball_specialization_traits[0].code,
            "SHOOTING_GRAVITY"
        );
        assert!(query_player_repertoire(&connection, "person:other")
            .unwrap()
            .unwrap()
            .technical_moves
            .is_empty());

        connection
            .execute(
                "UPDATE player_move_usage_24d SET usage_tendency=102 WHERE person_id='person:p'",
                [],
            )
            .unwrap();
        assert!(query_player_repertoire(&connection, "person:p")
            .unwrap_err()
            .contains("malformed PLAYER technical moves"));
        connection
            .execute(
                "UPDATE player_move_usage_24d SET usage_tendency=32 WHERE person_id='person:p'",
                [],
            )
            .unwrap();
        connection.execute(
            "UPDATE player_trait_strength_24d SET repertoire_version='UNKNOWN' WHERE person_id='person:p'",
            [],
        ).unwrap();
        assert!(query_player_repertoire(&connection, "person:p")
            .unwrap_err()
            .contains("unverified"));
    }

    #[test]
    fn query_positions_preserves_numeric_familiarity_without_promoting_roles() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE player_position(person_id TEXT, position_code TEXT, is_primary INTEGER, familiarity REAL);
            INSERT INTO player_position VALUES ('p','SG',1,91),('p','PG',0,65),('p','SF',0,12),('p','PF',0,1),('p','C',0,NULL);").unwrap();
        let rows = query_positions(&connection, "p").unwrap();
        assert_eq!(rows.len(), 5);
        assert_eq!(rows[0], ("SG".to_owned(), true, Some(91.0)));
        assert_eq!(rows[1], ("PG".to_owned(), false, Some(65.0)));
        assert!(rows
            .iter()
            .any(|(pos, _, score)| pos == "C" && score.is_none()));
    }

    #[test]
    fn bootstrap_projection_reads_canonical_organization_ids_and_records() {
        let connection = Connection::open_in_memory().expect("in-memory SQLite");
        connection.execute_batch(
            "CREATE TABLE entity(entity_id TEXT PRIMARY KEY, canonical_name TEXT NOT NULL);
             CREATE TABLE team(team_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, gender TEXT, country_place_id TEXT, organization_id TEXT NOT NULL, section_id TEXT NOT NULL);
             CREATE TABLE team_ecosystem_membership(team_id TEXT NOT NULL, competition_ecosystem_id TEXT NOT NULL, membership_status TEXT NOT NULL, valid_to TEXT);
             CREATE TABLE organization(organization_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, legal_name TEXT, founded_year INTEGER, dissolved_year INTEGER, primary_place_id TEXT, website TEXT);
             CREATE TABLE organization_section(section_id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, sport TEXT, gender TEXT, category_scope TEXT, canonical_name TEXT, valid_from TEXT, valid_to TEXT);
             CREATE TABLE organization_ownership(organization_ownership_id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, owner_kind TEXT NOT NULL, owner_id TEXT NOT NULL, ownership_percentage REAL, valid_from TEXT, valid_to TEXT);
             INSERT INTO entity VALUES ('team-entity-1', 'Club A'), ('org-entity-1', 'Club A legal entity');
             INSERT INTO team VALUES ('team-1', 'team-entity-1', 'M', 'place:ESP', 'org-42', 'section-7');
             INSERT INTO team_ecosystem_membership VALUES ('team-1', 'ecosystem-1', 'ACTIVE', NULL);
             INSERT INTO organization VALUES ('org-42', 'org-entity-1', 'Club A S.A.', 1980, NULL, 'place:ESP', 'https://club.example');
             INSERT INTO organization VALUES ('holding-1', 'holding-entity-1', 'Holding Company', NULL, NULL, NULL, NULL);
             INSERT INTO organization_section VALUES ('section-7', 'org-42', 'BASKETBALL', 'MALE', 'SENIOR', NULL, '1980-01-01', NULL);
             INSERT INTO organization_ownership VALUES ('ownership-person', 'org-42', 'person', 'person:owner-1', 60.0, '2020-01-01', NULL);
             INSERT INTO organization_ownership VALUES ('ownership-organization', 'org-42', 'ORGANIZATION', 'holding-1', NULL, NULL, '2019-12-31');",
        ).expect("canonical Organization fixture");

        let teams = query_teams(&connection, "ecosystem-1", "male").expect("team source row");
        assert_eq!(teams[0].organization_id, "org-42");
        assert_eq!(teams[0].organization_section_id, "section-7");
        let organizations = query_organizations(&connection, &["org-42".to_owned()])
            .expect("Organization source row");
        assert_eq!(organizations[0].legal_name.as_deref(), Some("Club A S.A."));
        assert_eq!(organizations[0].founded_year, Some(1980));
        let sections = query_organization_sections(&connection, &["section-7".to_owned()])
            .expect("OrganizationSection source row");
        assert_eq!(sections[0].organization_id, "org-42");
        assert_eq!(sections[0].canonical_name, "section-7");
        let ownership = query_organization_ownership(&connection, &["org-42".to_owned()])
            .expect("Organization ownership source rows");
        assert_eq!(
            ownership
                .iter()
                .map(|row| row.ownership_id.as_str())
                .collect::<Vec<_>>(),
            vec!["ownership-organization", "ownership-person"]
        );
        assert_eq!(ownership[0].owner_kind, "ORGANIZATION");
        assert_eq!(ownership[0].owner_id, "holding-1");
        assert_eq!(ownership[1].owner_kind, "PERSON");
        assert_eq!(ownership[1].owner_id, "person:owner-1");
    }

    #[test]
    fn investor_interest_query_maps_supported_actors_and_allows_zero_rows() {
        let connection = Connection::open_in_memory().expect("in-memory SQLite");
        connection.execute_batch(
            "CREATE TABLE organization_investor_interest (
                investor_interest_id TEXT PRIMARY KEY NOT NULL,
                organization_id TEXT NOT NULL,
                investor_kind TEXT NOT NULL,
                investor_id TEXT NOT NULL,
                interest_type TEXT NOT NULL,
                status TEXT,
                opened_on TEXT,
                closed_on TEXT
            );
            INSERT INTO organization_investor_interest VALUES
                ('interest:person', 'organization:target', 'person', 'person:investor', 'ACQUISITION', 'OPEN', '2030-01-01', NULL),
                ('interest:organization', 'organization:target', 'ORGANIZATION', 'organization:investor', 'PARTNERSHIP', NULL, NULL, '2030-12-31');",
        )
        .expect("investor interest fixture");

        let interests =
            query_organization_investor_interest(&connection, &["organization:target".to_owned()])
                .expect("investor interest rows");
        assert_eq!(interests.len(), 2);
        assert_eq!(interests[0].investor_kind, "ORGANIZATION");
        assert_eq!(interests[1].investor_kind, "PERSON");
        assert!(query_organization_investor_interest(&connection, &[])
            .unwrap()
            .is_empty());
    }

    #[test]
    fn native_reader_preserves_all_fifty_semantic_personality_dimensions() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(
            "CREATE TABLE person_personality_value (person_id TEXT, dimension_code TEXT, value INTEGER);",
        ).unwrap();
        let codes = [
            "ambition",
            "competitiveness",
            "achievementDrive",
            "statusSeeking",
            "persistence",
            "goalFocus",
            "recognitionNeed",
            "professionalism",
            "discipline",
            "preparation",
            "conscientiousness",
            "workEthic",
            "accountability",
            "coachability",
            "loyalty",
            "fairness",
            "integrity",
            "reciprocity",
            "contractualCommitment",
            "honesty",
            "resilience",
            "temperament",
            "stressTolerance",
            "impulseControl",
            "emotionalStability",
            "frustrationTolerance",
            "composure",
            "teamOrientation",
            "empathy",
            "communication",
            "leadership",
            "trust",
            "conflictResolution",
            "adaptability",
            "curiosity",
            "learningOrientation",
            "flexibility",
            "culturalOpenness",
            "uncertaintyTolerance",
            "riskAppetite",
            "decisionPatience",
            "decisiveness",
            "tacticalAwareness",
            "selfReflection",
            "mediaComfort",
            "privacyPreference",
            "socialConfidence",
            "publicResponsibility",
            "controversyTolerance",
            "humor",
        ];
        for (i, dimension) in codes.iter().enumerate() {
            connection
                .execute(
                    "INSERT INTO person_personality_value VALUES (?1,?2,?3)",
                    rusqlite::params!["person:complete", dimension, ((i * 13 + 21) % 101) as i64],
                )
                .unwrap();
        }
        let values = query_person_runtime_personality(&connection, "person:complete")
            .unwrap()
            .unwrap();
        assert_eq!(values.len(), 50);
        assert_eq!(values["ambition"], 21);
        assert_eq!(values["humor"], ((49 * 13 + 21) % 101) as u8);
        connection.execute(
            "DELETE FROM person_personality_value WHERE person_id='person:complete' AND dimension_code='humor'",
            [],
        ).unwrap();
        assert!(
            query_person_runtime_personality(&connection, "person:complete")
                .unwrap_err()
                .contains("partial semantic personality")
        );
    }

    #[test]
    fn production_spain_slice_smoke_is_opt_in_and_read_only() {
        let Some(database_path) = std::env::var_os("BDM_WORLD_DB_PATH") else {
            return;
        };
        let database_path = database_path.to_string_lossy();
        let slice = load_game_bootstrap_slice_v1(
            &database_path,
            "edition:ESP:liga-endesa:2025-26",
            "ecosystem:ESP:acb",
        )
        .expect("Spain ACB bootstrap slice");
        assert_eq!(slice.teams.len(), 18);
        assert_eq!(slice.players.len(), 270);
        assert_eq!(slice.staff_profiles.len(), 90);
        assert_eq!(
            slice
                .staff_assignments
                .iter()
                .filter(|row| row.role_code == "headCoach")
                .count(),
            18
        );
        assert_eq!(slice.roster_assignments.len(), 270);
        // Canonical scheduled matches are consumable even without fixture realization rows.
        assert!(slice
            .matches
            .iter()
            .all(|game| !game.home_team_id.is_empty() && !game.away_team_id.is_empty()));
        if let Some(output_path) = std::env::var_os("BDM_WORLD_DB_SLICE_JSON") {
            let json = serde_json::to_vec_pretty(&slice).expect("serialize slice");
            std::fs::write(output_path, json).expect("write smoke slice outside the DB");
        }
    }

    #[test]
    fn canonical_eight_personality_scores_are_imported_without_legacy_replacement() {
        let connection = Connection::open_in_memory().unwrap();
        assert!(query_person_runtime_personality(&connection, "person:a")
            .unwrap()
            .is_none());
        connection.execute_batch(
            "CREATE TABLE person_personality_value (person_id TEXT, dimension_code TEXT, value INTEGER);
             INSERT INTO person_personality_value VALUES ('person:a','P_01',99);"
        ).unwrap();
        assert!(query_person_runtime_personality(&connection, "person:a")
            .unwrap()
            .is_none());
        for (dimension, score) in [
            ("ambition", 93),
            ("professionalism", 84),
            ("loyalty", 61),
            ("resilience", 72),
            ("temperament", 58),
            ("teamOrientation", 88),
            ("adaptability", 77),
            ("competitiveness", 95),
        ] {
            connection
                .execute(
                    "INSERT INTO person_personality_value VALUES (?1,?2,?3)",
                    rusqlite::params!["person:a", dimension, score],
                )
                .unwrap();
        }
        let values = query_person_runtime_personality(&connection, "person:a")
            .unwrap()
            .unwrap();
        assert_eq!(values.len(), 8);
        assert_eq!(values["ambition"], 93);
        assert_eq!(values["competitiveness"], 95);
        assert!(query_person_runtime_personality(&connection, "person:b")
            .unwrap()
            .is_none());
    }

    #[test]
    fn partial_personality_and_invalid_scores_fail_closed() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(
            "CREATE TABLE person_personality_value (person_id TEXT, dimension_code TEXT, value INTEGER);
             INSERT INTO person_personality_value VALUES ('person:partial','ambition',80);"
        ).unwrap();
        assert!(
            query_person_runtime_personality(&connection, "person:partial")
                .unwrap_err()
                .contains("partial BDM runtime personality")
        );
        for (dimension, score) in [
            ("ambition", 93),
            ("professionalism", 84),
            ("loyalty", 61),
            ("resilience", 72),
            ("temperament", 58),
            ("teamOrientation", 88),
            ("adaptability", 77),
            ("competitiveness", 105),
        ] {
            connection
                .execute(
                    "INSERT INTO person_personality_value VALUES (?1,?2,?3)",
                    rusqlite::params!["person:bad", dimension, score],
                )
                .unwrap();
        }
        assert!(query_person_runtime_personality(&connection, "person:bad")
            .unwrap_err()
            .contains("out of 0..100"));
    }

    #[test]
    fn probe_universe_bootstrap_from_env() {
        let Ok(path) = std::env::var("BDM_P3_WORLD_DB") else {
            return;
        };
        let selected = std::env::var("BDM_P3_EDITIONS").ok();
        let wanted = |season: &str| {
            selected
                .as_ref()
                .is_none_or(|list| list.split(',').any(|s| s == season))
        };
        let connection =
            Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
        let mut statement = connection.prepare("SELECT DISTINCT a.competition_ecosystem_id, cs.competition_season_id FROM ecosystem_competition_assignment a JOIN competition_season cs ON cs.competition_id=a.competition_id ORDER BY 1,2").unwrap();
        let pairs: Vec<(String, String)> = statement
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        if let Ok(dir) = std::env::var("BDM_P3_EXPORT_DIR") {
            let dir = Path::new(&dir);
            let write = |name: String, value: serde_json::Value| {
                std::fs::write(dir.join(name), serde_json::to_vec(&value).unwrap()).unwrap()
            };
            write(
                "info.json".into(),
                serde_json::to_value(crate::world_db_session::inspect_database_v1(&path).unwrap())
                    .unwrap(),
            );
            write(
                "catalog.json".into(),
                serde_json::to_value(
                    crate::world_db_selection::load_selection_catalog_v1(&path).unwrap(),
                )
                .unwrap(),
            );
            let seasons: Vec<String> = connection
                .prepare("SELECT competition_season_id FROM competition_season ORDER BY 1")
                .unwrap()
                .query_map([], |r| r.get(0))
                .unwrap()
                .map(|r| r.unwrap())
                .collect();
            for season in seasons {
                if !wanted(&season) {
                    continue;
                }
                let key = season.replace(':', "_");
                if let Ok(bundle) = crate::world_db::load_competition_bundle_v1(&path, &season) {
                    write(
                        format!("bundle__{key}.json"),
                        serde_json::to_value(bundle).unwrap(),
                    );
                }
                if let Ok(matches) =
                    crate::world_db_matches::load_match_realizations_v1(&path, &season)
                {
                    write(
                        format!("matches__{key}.json"),
                        serde_json::to_value(matches).unwrap(),
                    );
                }
            }
        }
        for (ecosystem, season) in pairs {
            if !wanted(&season) {
                continue;
            }
            match load_game_bootstrap_slice_v1(&path, &season, &ecosystem) {
                Ok(slice) => {
                    println!("PROBE OK  {ecosystem} {season} teams={} players={} staff={} contracts={} finance={} unmapped={}", slice.teams.len(), slice.players.len(), slice.staff_profiles.len(), slice.contracts.len(), slice.finance.len(), slice.unmapped_staff_assignments.len());
                    // Real-data bridge for the TypeScript suites: the exact JSON the Tauri command returns.
                    if let Ok(dir) = std::env::var("BDM_P3_EXPORT_DIR") {
                        let name = format!(
                            "{}__{}.json",
                            ecosystem.replace(':', "_"),
                            season.replace(':', "_")
                        );
                        std::fs::write(
                            Path::new(&dir).join(name),
                            serde_json::to_vec(&slice).unwrap(),
                        )
                        .unwrap();
                    }
                }
                Err(error) => {
                    assert!(
                        selected.is_none(),
                        "Selected universe import failed: {error}"
                    );
                    println!("PROBE ERR {ecosystem} {season}: {error}");
                }
            }
        }
    }
}
