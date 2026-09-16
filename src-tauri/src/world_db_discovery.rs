use crate::world_db_session::{source_ref_v1, WorldDbDatabaseSourceV1};
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::Path;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbPlayableSeasonV1 {
    competition_season_id: String,
    season_id: String,
    edition_number: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbPlayableCompetitionV1 {
    ecosystem_competition_assignment_id: String,
    competition_id: String,
    name: String,
    ecosystem_level_id: Option<String>,
    ecosystem_unit_id: Option<String>,
    role_type: String,
    valid_from: Option<String>,
    valid_to: Option<String>,
    seasons: Vec<WorldDbPlayableSeasonV1>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbPlayableLevelV1 {
    ecosystem_level_id: String,
    parent_level_id: Option<String>,
    level_code: String,
    name: String,
    tier_order: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbPlayableUnitV1 {
    ecosystem_unit_id: String,
    ecosystem_level_id: Option<String>,
    parent_unit_id: Option<String>,
    unit_type: String,
    code: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbPlayableTeamMembershipV1 {
    team_ecosystem_membership_id: String,
    ecosystem_level_id: Option<String>,
    membership_status: String,
    valid_from: Option<String>,
    valid_to: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbPlayableTeamUnitMembershipV1 {
    team_ecosystem_unit_membership_id: String,
    ecosystem_unit_id: String,
    membership_status: String,
    valid_from: Option<String>,
    valid_to: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbPlayableTeamV1 {
    team_id: String,
    name: String,
    memberships: Vec<WorldDbPlayableTeamMembershipV1>,
    unit_memberships: Vec<WorldDbPlayableTeamUnitMembershipV1>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbPlayableEcosystemV1 {
    competition_ecosystem_id: String,
    code: String,
    name: String,
    gender: Option<String>,
    levels: Vec<WorldDbPlayableLevelV1>,
    units: Vec<WorldDbPlayableUnitV1>,
    competitions: Vec<WorldDbPlayableCompetitionV1>,
    teams: Vec<WorldDbPlayableTeamV1>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbPlayableCatalogV1 {
    schema_version: u8,
    source: WorldDbDatabaseSourceV1,
    ecosystems: Vec<WorldDbPlayableEcosystemV1>,
}

struct EcosystemRow {
    competition_ecosystem_id: String,
    code: String,
    name: String,
    gender: Option<String>,
}

pub fn discover_playable_catalog_v1(database_path: &str) -> Result<WorldDbPlayableCatalogV1, String> {
    if database_path.trim().is_empty() {
        return Err("databasePath must be non-empty".to_owned());
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

    discover_from_connection(&connection, path)
}

fn discover_from_connection(
    connection: &Connection,
    path: &Path,
) -> Result<WorldDbPlayableCatalogV1, String> {
    let ecosystem_rows = query_many(
        connection,
        "SELECT competition_ecosystem_id, code, name, gender FROM competition_ecosystem ORDER BY code, competition_ecosystem_id",
        |row| {
            Ok(EcosystemRow {
                competition_ecosystem_id: row.get(0)?,
                code: row.get(1)?,
                name: row.get(2)?,
                gender: row.get(3)?,
            })
        },
    )?;

    let mut levels_by_ecosystem: BTreeMap<String, Vec<WorldDbPlayableLevelV1>> = BTreeMap::new();
    for (ecosystem_id, level) in query_many(
        connection,
        "SELECT competition_ecosystem_id, ecosystem_level_id, parent_level_id, level_code, name, tier_order FROM ecosystem_level ORDER BY competition_ecosystem_id, COALESCE(tier_order, 2147483647), level_code, ecosystem_level_id",
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                WorldDbPlayableLevelV1 {
                    ecosystem_level_id: row.get(1)?,
                    parent_level_id: row.get(2)?,
                    level_code: row.get(3)?,
                    name: row.get(4)?,
                    tier_order: row.get(5)?,
                },
            ))
        },
    )? {
        levels_by_ecosystem.entry(ecosystem_id).or_default().push(level);
    }

    let mut units_by_ecosystem: BTreeMap<String, Vec<WorldDbPlayableUnitV1>> = BTreeMap::new();
    for (ecosystem_id, unit) in query_many(
        connection,
        "SELECT competition_ecosystem_id, ecosystem_unit_id, ecosystem_level_id, parent_unit_id, unit_type, code, name FROM ecosystem_unit ORDER BY competition_ecosystem_id, unit_type, code, ecosystem_unit_id",
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                WorldDbPlayableUnitV1 {
                    ecosystem_unit_id: row.get(1)?,
                    ecosystem_level_id: row.get(2)?,
                    parent_unit_id: row.get(3)?,
                    unit_type: row.get(4)?,
                    code: row.get(5)?,
                    name: row.get(6)?,
                },
            ))
        },
    )? {
        units_by_ecosystem.entry(ecosystem_id).or_default().push(unit);
    }

    let mut seasons_by_competition: BTreeMap<String, Vec<WorldDbPlayableSeasonV1>> = BTreeMap::new();
    for (competition_id, season) in query_many(
        connection,
        "SELECT competition_id, competition_season_id, season_id, edition_number FROM competition_season ORDER BY competition_id, competition_season_id",
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                WorldDbPlayableSeasonV1 {
                    competition_season_id: row.get(1)?,
                    season_id: row.get(2)?,
                    edition_number: row.get(3)?,
                },
            ))
        },
    )? {
        seasons_by_competition.entry(competition_id).or_default().push(season);
    }

    let mut competitions_by_ecosystem: BTreeMap<String, Vec<WorldDbPlayableCompetitionV1>> = BTreeMap::new();
    for (
        ecosystem_id,
        assignment_id,
        competition_id,
        name,
        level_id,
        unit_id,
        role_type,
        valid_from,
        valid_to,
    ) in query_many(
        connection,
        "SELECT a.competition_ecosystem_id, a.ecosystem_competition_assignment_id, a.competition_id, e.canonical_name, a.ecosystem_level_id, a.ecosystem_unit_id, a.role_type, a.valid_from, a.valid_to FROM ecosystem_competition_assignment a JOIN competition c ON c.competition_id = a.competition_id JOIN entity e ON e.entity_id = c.entity_id ORDER BY a.competition_ecosystem_id, a.role_type, e.canonical_name, a.ecosystem_competition_assignment_id",
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
            ))
        },
    )? {
        let seasons = seasons_by_competition
            .get(&competition_id)
            .cloned()
            .unwrap_or_default();
        competitions_by_ecosystem
            .entry(ecosystem_id)
            .or_default()
            .push(WorldDbPlayableCompetitionV1 {
                ecosystem_competition_assignment_id: assignment_id,
                competition_id,
                name,
                ecosystem_level_id: level_id,
                ecosystem_unit_id: unit_id,
                role_type,
                valid_from,
                valid_to,
                seasons,
            });
    }

    let mut team_names_by_ecosystem: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();
    for (ecosystem_id, team_id, name) in query_many(
        connection,
        "SELECT DISTINCT m.competition_ecosystem_id, t.team_id, e.canonical_name FROM team_ecosystem_membership m JOIN team t ON t.team_id = m.team_id JOIN entity e ON e.entity_id = t.entity_id ORDER BY m.competition_ecosystem_id, e.canonical_name, t.team_id",
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)),
    )? {
        team_names_by_ecosystem
            .entry(ecosystem_id)
            .or_default()
            .insert(team_id, name);
    }

    let mut memberships_by_team: BTreeMap<(String, String), Vec<WorldDbPlayableTeamMembershipV1>> = BTreeMap::new();
    for (ecosystem_id, team_id, membership) in query_many(
        connection,
        "SELECT competition_ecosystem_id, team_id, team_ecosystem_membership_id, ecosystem_level_id, membership_status, valid_from, valid_to FROM team_ecosystem_membership ORDER BY competition_ecosystem_id, team_id, team_ecosystem_membership_id",
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                WorldDbPlayableTeamMembershipV1 {
                    team_ecosystem_membership_id: row.get(2)?,
                    ecosystem_level_id: row.get(3)?,
                    membership_status: row.get(4)?,
                    valid_from: row.get(5)?,
                    valid_to: row.get(6)?,
                },
            ))
        },
    )? {
        memberships_by_team
            .entry((ecosystem_id, team_id))
            .or_default()
            .push(membership);
    }

    let mut unit_memberships_by_team: BTreeMap<(String, String), Vec<WorldDbPlayableTeamUnitMembershipV1>> = BTreeMap::new();
    for (ecosystem_id, team_id, membership) in query_many(
        connection,
        "SELECT u.competition_ecosystem_id, m.team_id, m.team_ecosystem_unit_membership_id, m.ecosystem_unit_id, m.membership_status, m.valid_from, m.valid_to FROM team_ecosystem_unit_membership m JOIN ecosystem_unit u ON u.ecosystem_unit_id = m.ecosystem_unit_id ORDER BY u.competition_ecosystem_id, m.team_id, m.team_ecosystem_unit_membership_id",
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                WorldDbPlayableTeamUnitMembershipV1 {
                    team_ecosystem_unit_membership_id: row.get(2)?,
                    ecosystem_unit_id: row.get(3)?,
                    membership_status: row.get(4)?,
                    valid_from: row.get(5)?,
                    valid_to: row.get(6)?,
                },
            ))
        },
    )? {
        unit_memberships_by_team
            .entry((ecosystem_id, team_id))
            .or_default()
            .push(membership);
    }

    let mut ecosystems = Vec::with_capacity(ecosystem_rows.len());
    for row in ecosystem_rows {
        let team_names = team_names_by_ecosystem
            .remove(&row.competition_ecosystem_id)
            .unwrap_or_default();
        let mut teams = Vec::with_capacity(team_names.len());
        for (team_id, name) in team_names {
            let key = (row.competition_ecosystem_id.clone(), team_id.clone());
            teams.push(WorldDbPlayableTeamV1 {
                team_id,
                name,
                memberships: memberships_by_team.remove(&key).unwrap_or_default(),
                unit_memberships: unit_memberships_by_team.remove(&key).unwrap_or_default(),
            });
        }

        ecosystems.push(WorldDbPlayableEcosystemV1 {
            competition_ecosystem_id: row.competition_ecosystem_id.clone(),
            code: row.code,
            name: row.name,
            gender: row.gender,
            levels: levels_by_ecosystem
                .remove(&row.competition_ecosystem_id)
                .unwrap_or_default(),
            units: units_by_ecosystem
                .remove(&row.competition_ecosystem_id)
                .unwrap_or_default(),
            competitions: competitions_by_ecosystem
                .remove(&row.competition_ecosystem_id)
                .unwrap_or_default(),
            teams,
        });
    }

    Ok(WorldDbPlayableCatalogV1 {
        schema_version: 1,
        source: source_ref_v1(path),
        ecosystems,
    })
}

fn query_many<T, F>(connection: &Connection, sql: &str, mut map: F) -> Result<Vec<T>, String>
where
    F: FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
{
    let mut statement = connection
        .prepare(sql)
        .map_err(|error| format!("Unable to prepare World DB discovery query: {error}"))?;
    let rows = statement
        .query_map([], |row| map(row))
        .map_err(|error| format!("Unable to query World DB discovery data: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB discovery row: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovers_nested_ecosystem_catalog_deterministically() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        connection
            .execute_batch(
                r#"
                CREATE TABLE entity (entity_id TEXT PRIMARY KEY, canonical_name TEXT NOT NULL);
                CREATE TABLE competition (competition_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL);
                CREATE TABLE competition_season (competition_season_id TEXT PRIMARY KEY, competition_id TEXT NOT NULL, season_id TEXT NOT NULL, edition_number INTEGER);
                CREATE TABLE team (team_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL);
                CREATE TABLE competition_ecosystem (competition_ecosystem_id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, gender TEXT);
                CREATE TABLE ecosystem_level (ecosystem_level_id TEXT PRIMARY KEY, competition_ecosystem_id TEXT NOT NULL, parent_level_id TEXT, level_code TEXT NOT NULL, name TEXT NOT NULL, tier_order INTEGER);
                CREATE TABLE ecosystem_unit (ecosystem_unit_id TEXT PRIMARY KEY, competition_ecosystem_id TEXT NOT NULL, ecosystem_level_id TEXT, parent_unit_id TEXT, unit_type TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL);
                CREATE TABLE ecosystem_competition_assignment (ecosystem_competition_assignment_id TEXT PRIMARY KEY, competition_ecosystem_id TEXT NOT NULL, competition_id TEXT NOT NULL, ecosystem_level_id TEXT, ecosystem_unit_id TEXT, role_type TEXT NOT NULL, valid_from TEXT, valid_to TEXT);
                CREATE TABLE team_ecosystem_membership (team_ecosystem_membership_id TEXT PRIMARY KEY, competition_ecosystem_id TEXT NOT NULL, team_id TEXT NOT NULL, ecosystem_level_id TEXT, membership_status TEXT NOT NULL, valid_from TEXT, valid_to TEXT);
                CREATE TABLE team_ecosystem_unit_membership (team_ecosystem_unit_membership_id TEXT PRIMARY KEY, ecosystem_unit_id TEXT NOT NULL, team_id TEXT NOT NULL, membership_status TEXT NOT NULL, valid_from TEXT, valid_to TEXT);

                INSERT INTO entity VALUES ('entity:competition:big-ten', 'Big Ten Conference');
                INSERT INTO entity VALUES ('entity:team:michigan', 'Michigan Wolverines');
                INSERT INTO competition VALUES ('competition:big-ten', 'entity:competition:big-ten');
                INSERT INTO competition_season VALUES ('competition-season:big-ten:2025', 'competition:big-ten', 'season:2025-26', 1);
                INSERT INTO team VALUES ('team:michigan', 'entity:team:michigan');
                INSERT INTO competition_ecosystem VALUES ('ecosystem:ncaa-d1', 'NCAA_D1_M', 'NCAA Division I Men', 'M');
                INSERT INTO ecosystem_level VALUES ('level:ncaa-d1', 'ecosystem:ncaa-d1', NULL, 'D1', 'Division I', 1);
                INSERT INTO ecosystem_unit VALUES ('unit:big-ten', 'ecosystem:ncaa-d1', 'level:ncaa-d1', NULL, 'CONFERENCE', 'BIG_TEN', 'Big Ten');
                INSERT INTO ecosystem_competition_assignment VALUES ('assignment:big-ten', 'ecosystem:ncaa-d1', 'competition:big-ten', 'level:ncaa-d1', 'unit:big-ten', 'REGULAR_SEASON', '2025-07-01', NULL);
                INSERT INTO team_ecosystem_membership VALUES ('membership:michigan:d1', 'ecosystem:ncaa-d1', 'team:michigan', 'level:ncaa-d1', 'ACTIVE', '2025-07-01', NULL);
                INSERT INTO team_ecosystem_unit_membership VALUES ('membership:michigan:big-ten', 'unit:big-ten', 'team:michigan', 'ACTIVE', '2025-07-01', NULL);
                "#,
            )
            .expect("fixture schema");

        let catalog = discover_from_connection(&connection, Path::new("phase1.db"))
            .expect("catalog discovery");
        assert_eq!(catalog.schema_version, 1);
        assert_eq!(catalog.ecosystems.len(), 1);
        let ecosystem = &catalog.ecosystems[0];
        assert_eq!(ecosystem.competition_ecosystem_id, "ecosystem:ncaa-d1");
        assert_eq!(ecosystem.units[0].ecosystem_unit_id, "unit:big-ten");
        assert_eq!(ecosystem.competitions[0].competition_id, "competition:big-ten");
        assert_eq!(
            ecosystem.competitions[0].seasons[0].competition_season_id,
            "competition-season:big-ten:2025"
        );
        assert_eq!(ecosystem.teams[0].team_id, "team:michigan");
        assert_eq!(
            ecosystem.teams[0].unit_memberships[0].ecosystem_unit_id,
            "unit:big-ten"
        );
    }

    #[test]
    fn rejects_missing_database_file() {
        assert!(discover_playable_catalog_v1("__bdm_missing_discovery__.sqlite").is_err());
    }
}
