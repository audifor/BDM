use rusqlite::{Connection, OpenFlags};
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
    gender: String,
    date_of_birth: String,
    nationality_ids: Vec<String>,
    physical: WorldDbGameBootstrapPersonPhysicalV1,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapDevelopmentDimensionV1 {
    dimension_code: String,
    ceiling: f64,
    growth_rate: f64,
    decline_sensitivity: f64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapPlayerV1 {
    player_id: String,
    person_id: String,
    primary_position: String,
    secondary_positions: Vec<String>,
    dominant_hand: String,
    ratings: BTreeMap<String, f64>,
    tendencies: BTreeMap<String, f64>,
    development: Vec<WorldDbGameBootstrapDevelopmentDimensionV1>,
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
    schema_version: u8,
    source: WorldDbGameBootstrapSourceV1,
    ecosystem: WorldDbGameBootstrapEcosystemV1,
    competition: WorldDbGameBootstrapCompetitionV1,
    season: WorldDbGameBootstrapSeasonV1,
    countries: Vec<WorldDbGameBootstrapCountryV1>,
    organizations: Vec<WorldDbGameBootstrapOrganizationV1>,
    organization_sections: Vec<WorldDbGameBootstrapOrganizationSectionV1>,
    teams: Vec<WorldDbGameBootstrapTeamV1>,
    persons: Vec<WorldDbGameBootstrapPersonV1>,
    players: Vec<WorldDbGameBootstrapPlayerV1>,
    staff_profiles: Vec<WorldDbGameBootstrapStaffV1>,
    staff_assignments: Vec<WorldDbGameBootstrapStaffAssignmentV1>,
    roster_assignments: Vec<WorldDbGameBootstrapRosterAssignmentV1>,
    matches: Vec<WorldDbGameBootstrapMatchV1>,
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
    let teams = query_teams(&connection, ecosystem_id, &gender)?;
    if teams.len() < 2 {
        return Err(
            "World DB bootstrap ecosystem membership requires at least two teams".to_owned(),
        );
    }
    let team_ids: Vec<String> = teams.iter().map(|team| team.team_id.clone()).collect();
    let organization_ids: Vec<String> =
        BTreeSet::from_iter(teams.iter().map(|team| team.organization_id.clone()))
            .into_iter()
            .collect();
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
    let staff_assignments = query_staff_assignments(&connection, &team_ids, &season.start_date)?;
    validate_head_coaches(&staff_assignments, &team_ids)?;
    let staff_ids: Vec<String> = staff_assignments
        .iter()
        .map(|row| row.staff_id.clone())
        .collect();
    let staff_ids: Vec<String> = BTreeSet::from_iter(staff_ids).into_iter().collect();
    let mut persons = Vec::new();
    let mut players = Vec::new();
    for person_id in player_ids.iter() {
        let person = query_person(&connection, person_id)?;
        persons.push(person);
        players.push(query_player(&connection, person_id)?);
    }
    let mut staff_profiles = Vec::new();
    for staff_id in staff_ids.iter() {
        let person_id = staff_id
            .strip_prefix("staff:")
            .ok_or_else(|| format!("World DB Staff profile has invalid identity: {staff_id}"))?;
        persons.push(query_person(&connection, person_id)?);
        staff_profiles.push(query_staff(&connection, person_id)?);
    }
    persons.sort_by(|a, b| a.person_id.cmp(&b.person_id));
    let countries = query_countries(&connection, &teams, &persons)?;
    let matches = query_matches(&connection, competition_season_id)?;
    Ok(WorldDbGameBootstrapSliceV1 {
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
        teams,
        persons,
        players,
        staff_profiles,
        staff_assignments,
        roster_assignments,
        matches,
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
    let sql = format!("SELECT section_id,organization_id,sport,gender,category_scope,canonical_name,valid_from,valid_to FROM organization_section WHERE section_id IN ({}) ORDER BY section_id", placeholders_from(1, ids.len()));
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
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|error| format!("Unable to load World DB person {person_id}: {error}"))?;
    let (first_name, last_name) = connection.query_row("SELECT given_name,family_name FROM person_name WHERE person_id=?1 AND valid_to IS NULL ORDER BY is_primary DESC,is_preferred DESC,person_name_id LIMIT 1", [person_id], |row| Ok((row.get::<_, String>(0)?,row.get::<_, String>(1)?))).map_err(|error| format!("Unable to load World DB primary name {person_id}: {error}"))?;
    let nationalities = query_string_column(connection, "SELECT place_id FROM person_nationality WHERE person_id=?1 AND valid_to IS NULL ORDER BY is_primary DESC,person_nationality_id", person_id)?;
    if nationalities.is_empty() {
        return Err(format!(
            "World DB person has no canonical nationality: {person_id}"
        ));
    }
    let physical = connection.query_row("SELECT height_cm,weight_kg,wingspan_cm,standing_reach_cm FROM person_physical_snapshot WHERE person_id=?1 ORDER BY effective_date DESC,physical_snapshot_id DESC LIMIT 1", [person_id], |row| Ok(WorldDbGameBootstrapPersonPhysicalV1 { height_cm: row.get(0)?,weight_kg: row.get(1)?,wingspan_cm: row.get(2)?,standing_reach_cm: row.get(3)? })).map_err(|error| format!("Unable to load World DB physical snapshot {person_id}: {error}"))?;
    Ok(WorldDbGameBootstrapPersonV1 {
        person_id: person_id.to_owned(),
        first_name,
        last_name,
        gender: gender_from_ecosystem(Some(&sex)),
        date_of_birth,
        nationality_ids: nationalities,
        physical,
    })
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
    let primary_count = positions.iter().filter(|(_, primary)| *primary).count();
    if primary_count != 1 {
        return Err(format!(
            "World DB player must have exactly one primary position: {person_id}"
        ));
    }
    let primary_position = positions
        .iter()
        .find(|(_, primary)| *primary)
        .unwrap()
        .0
        .clone();
    let secondary_positions = positions
        .into_iter()
        .filter(|(_, primary)| !*primary)
        .map(|(code, _)| code)
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
        dominant_hand,
        ratings,
        tendencies,
        development,
    })
}

fn query_positions(
    connection: &Connection,
    person_id: &str,
) -> Result<Vec<(String, bool)>, String> {
    let mut statement = connection.prepare("SELECT position_code,is_primary FROM player_position WHERE person_id=?1 ORDER BY is_primary DESC,familiarity DESC,position_code").map_err(|error| format!("Unable to prepare World DB position query: {error}"))?;
    let rows = statement
        .query_map([person_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? != 0))
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

fn query_staff_assignments(
    connection: &Connection,
    team_ids: &[String],
    assigned_on: &str,
) -> Result<Vec<WorldDbGameBootstrapStaffAssignmentV1>, String> {
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
            let assignment_id: String = row.get(0)?;
            let person_id: String = row.get(1)?;
            let team_id: String = row.get(2)?;
            let role: String = row.get(3)?;
            Ok(WorldDbGameBootstrapStaffAssignmentV1 {
                assignment_id,
                staff_id: format!("staff:{person_id}"),
                team_id,
                role_code: map_staff_role(&role).map_err(|_| rusqlite::Error::InvalidQuery)?,
                assigned_on: row.get(4)?,
            })
        })
        .map_err(|error| format!("Unable to query World DB staff assignments: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|error| {
        format!(
            "Unable to decode World DB staff assignment (unknown role or malformed row): {error}"
        )
    })
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
    let sql="SELECT DISTINCT m.match_id,m.scheduled_at,m.played_at,m.status,m.home_team_id,m.away_team_id,m.home_score,m.away_score FROM match m JOIN game_fixture_realization r ON r.match_id=m.match_id JOIN competition_fixture f ON f.competition_fixture_id=r.competition_fixture_id WHERE f.competition_season_id=?1 AND UPPER(m.status) IN ('SCHEDULED','COMPLETED') ORDER BY m.match_id";
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
    fn bootstrap_projection_reads_canonical_organization_ids_and_records() {
        let connection = Connection::open_in_memory().expect("in-memory SQLite");
        connection.execute_batch(
            "CREATE TABLE entity(entity_id TEXT PRIMARY KEY, canonical_name TEXT NOT NULL);
             CREATE TABLE team(team_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, gender TEXT, country_place_id TEXT, organization_id TEXT NOT NULL, section_id TEXT NOT NULL);
             CREATE TABLE team_ecosystem_membership(team_id TEXT NOT NULL, competition_ecosystem_id TEXT NOT NULL, membership_status TEXT NOT NULL, valid_to TEXT);
             CREATE TABLE organization(organization_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, legal_name TEXT, founded_year INTEGER, dissolved_year INTEGER, primary_place_id TEXT, website TEXT);
             CREATE TABLE organization_section(section_id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, sport TEXT, gender TEXT, category_scope TEXT, canonical_name TEXT NOT NULL, valid_from TEXT, valid_to TEXT);
             INSERT INTO entity VALUES ('team-entity-1', 'Club A'), ('org-entity-1', 'Club A legal entity');
             INSERT INTO team VALUES ('team-1', 'team-entity-1', 'M', 'place:ESP', 'org-42', 'section-7');
             INSERT INTO team_ecosystem_membership VALUES ('team-1', 'ecosystem-1', 'ACTIVE', NULL);
             INSERT INTO organization VALUES ('org-42', 'org-entity-1', 'Club A S.A.', 1980, NULL, 'place:ESP', 'https://club.example');
             INSERT INTO organization_section VALUES ('section-7', 'org-42', 'BASKETBALL', 'MALE', 'SENIOR', 'Club A Senior Men', '1980-01-01', NULL);",
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
        assert_eq!(sections[0].canonical_name, "Club A Senior Men");
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
        assert!(
            slice.matches.is_empty(),
            "this smoke expects B04-derived games for the current DB"
        );
        if let Some(output_path) = std::env::var_os("BDM_WORLD_DB_SLICE_JSON") {
            let json = serde_json::to_vec_pretty(&slice).expect("serialize slice");
            std::fs::write(output_path, json).expect("write smoke slice outside the DB");
        }
    }
}
