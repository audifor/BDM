use rusqlite::{Connection, OpenFlags, Row};
use serde::Serialize;
use std::path::Path;

const WORLD_DB_SCHEMA_ID: &str = "DDL-PHASE1-A";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbSelectionSourceV1 {
    database_id: String,
    schema_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbSelectionEcosystemV1 {
    ecosystem_id: String,
    code: String,
    name: String,
    gender: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbSelectionLevelV1 {
    level_id: String,
    ecosystem_id: String,
    parent_level_id: Option<String>,
    code: String,
    name: String,
    tier_order: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbSelectionUnitV1 {
    unit_id: String,
    ecosystem_id: String,
    level_id: Option<String>,
    parent_unit_id: Option<String>,
    organization_id: Option<String>,
    unit_type: String,
    code: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbSelectionCompetitionAssignmentV1 {
    assignment_id: String,
    ecosystem_id: String,
    competition_id: String,
    competition_name: String,
    level_id: Option<String>,
    unit_id: Option<String>,
    role_type: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbSelectionCompetitionSeasonV1 {
    competition_season_id: String,
    competition_id: String,
    competition_name: String,
    season_id: String,
    edition_number: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbSelectionTeamMembershipV1 {
    membership_id: String,
    ecosystem_id: String,
    team_id: String,
    team_name: String,
    level_id: Option<String>,
    membership_status: String,
    valid_from: Option<String>,
    valid_to: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbSelectionTeamUnitMembershipV1 {
    membership_id: String,
    unit_id: String,
    team_id: String,
    team_name: String,
    membership_status: String,
    valid_from: Option<String>,
    valid_to: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbSelectionCatalogV1 {
    schema_version: u8,
    source: WorldDbSelectionSourceV1,
    ecosystems: Vec<WorldDbSelectionEcosystemV1>,
    levels: Vec<WorldDbSelectionLevelV1>,
    units: Vec<WorldDbSelectionUnitV1>,
    competition_assignments: Vec<WorldDbSelectionCompetitionAssignmentV1>,
    competition_seasons: Vec<WorldDbSelectionCompetitionSeasonV1>,
    team_memberships: Vec<WorldDbSelectionTeamMembershipV1>,
    team_unit_memberships: Vec<WorldDbSelectionTeamUnitMembershipV1>,
}

pub fn load_selection_catalog_v1(
    database_path: &str,
) -> Result<WorldDbSelectionCatalogV1, String> {
    crate::world_db_session::inspect_database_v1(database_path)?;

    let path = Path::new(database_path);
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("Unable to open World DB read-only: {error}"))?;
    connection
        .execute_batch("PRAGMA query_only = ON; PRAGMA foreign_keys = ON;")
        .map_err(|error| format!("Unable to configure World DB connection: {error}"))?;

    read_selection_catalog(
        &connection,
        WorldDbSelectionSourceV1 {
            database_id: path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("bdm-world.db")
                .to_owned(),
            schema_id: WORLD_DB_SCHEMA_ID.to_owned(),
        },
    )
}

fn read_selection_catalog(
    connection: &Connection,
    source: WorldDbSelectionSourceV1,
) -> Result<WorldDbSelectionCatalogV1, String> {
    let ecosystems = query_all(
        connection,
        "SELECT competition_ecosystem_id, code, name, gender FROM competition_ecosystem ORDER BY code, competition_ecosystem_id",
        |row| {
            Ok(WorldDbSelectionEcosystemV1 {
                ecosystem_id: row.get(0)?,
                code: row.get(1)?,
                name: row.get(2)?,
                gender: row.get(3)?,
            })
        },
    )?;
    let levels = query_all(
        connection,
        "SELECT ecosystem_level_id, competition_ecosystem_id, parent_level_id, level_code, name, tier_order FROM ecosystem_level ORDER BY competition_ecosystem_id, COALESCE(tier_order, 2147483647), level_code, ecosystem_level_id",
        |row| {
            Ok(WorldDbSelectionLevelV1 {
                level_id: row.get(0)?,
                ecosystem_id: row.get(1)?,
                parent_level_id: row.get(2)?,
                code: row.get(3)?,
                name: row.get(4)?,
                tier_order: row.get(5)?,
            })
        },
    )?;
    let units = query_all(
        connection,
        "SELECT ecosystem_unit_id, competition_ecosystem_id, ecosystem_level_id, parent_unit_id, organization_id, unit_type, code, name FROM ecosystem_unit ORDER BY competition_ecosystem_id, code, ecosystem_unit_id",
        |row| {
            Ok(WorldDbSelectionUnitV1 {
                unit_id: row.get(0)?,
                ecosystem_id: row.get(1)?,
                level_id: row.get(2)?,
                parent_unit_id: row.get(3)?,
                organization_id: row.get(4)?,
                unit_type: row.get(5)?,
                code: row.get(6)?,
                name: row.get(7)?,
            })
        },
    )?;
    let competition_assignments = query_all(
        connection,
        "SELECT a.ecosystem_competition_assignment_id, a.competition_ecosystem_id, a.competition_id, e.canonical_name, a.ecosystem_level_id, a.ecosystem_unit_id, a.role_type FROM ecosystem_competition_assignment a JOIN competition c ON c.competition_id = a.competition_id JOIN entity e ON e.entity_id = c.entity_id ORDER BY a.competition_ecosystem_id, a.role_type, e.canonical_name, a.ecosystem_competition_assignment_id",
        |row| {
            Ok(WorldDbSelectionCompetitionAssignmentV1 {
                assignment_id: row.get(0)?,
                ecosystem_id: row.get(1)?,
                competition_id: row.get(2)?,
                competition_name: row.get(3)?,
                level_id: row.get(4)?,
                unit_id: row.get(5)?,
                role_type: row.get(6)?,
            })
        },
    )?;
    let competition_seasons = query_all(
        connection,
        "SELECT DISTINCT cs.competition_season_id, cs.competition_id, e.canonical_name, cs.season_id, cs.edition_number FROM competition_season cs JOIN ecosystem_competition_assignment a ON a.competition_id = cs.competition_id JOIN competition c ON c.competition_id = cs.competition_id JOIN entity e ON e.entity_id = c.entity_id ORDER BY e.canonical_name, cs.competition_season_id",
        |row| {
            Ok(WorldDbSelectionCompetitionSeasonV1 {
                competition_season_id: row.get(0)?,
                competition_id: row.get(1)?,
                competition_name: row.get(2)?,
                season_id: row.get(3)?,
                edition_number: row.get(4)?,
            })
        },
    )?;
    let team_memberships = query_all(
        connection,
        "SELECT m.team_ecosystem_membership_id, m.competition_ecosystem_id, m.team_id, e.canonical_name, m.ecosystem_level_id, m.membership_status, m.valid_from, m.valid_to FROM team_ecosystem_membership m JOIN team t ON t.team_id = m.team_id JOIN entity e ON e.entity_id = t.entity_id ORDER BY m.competition_ecosystem_id, e.canonical_name, m.team_ecosystem_membership_id",
        |row| {
            Ok(WorldDbSelectionTeamMembershipV1 {
                membership_id: row.get(0)?,
                ecosystem_id: row.get(1)?,
                team_id: row.get(2)?,
                team_name: row.get(3)?,
                level_id: row.get(4)?,
                membership_status: row.get(5)?,
                valid_from: row.get(6)?,
                valid_to: row.get(7)?,
            })
        },
    )?;
    let team_unit_memberships = query_all(
        connection,
        "SELECT m.team_ecosystem_unit_membership_id, m.ecosystem_unit_id, m.team_id, e.canonical_name, m.membership_status, m.valid_from, m.valid_to FROM team_ecosystem_unit_membership m JOIN team t ON t.team_id = m.team_id JOIN entity e ON e.entity_id = t.entity_id ORDER BY m.ecosystem_unit_id, e.canonical_name, m.team_ecosystem_unit_membership_id",
        |row| {
            Ok(WorldDbSelectionTeamUnitMembershipV1 {
                membership_id: row.get(0)?,
                unit_id: row.get(1)?,
                team_id: row.get(2)?,
                team_name: row.get(3)?,
                membership_status: row.get(4)?,
                valid_from: row.get(5)?,
                valid_to: row.get(6)?,
            })
        },
    )?;

    Ok(WorldDbSelectionCatalogV1 {
        schema_version: 1,
        source,
        ecosystems,
        levels,
        units,
        competition_assignments,
        competition_seasons,
        team_memberships,
        team_unit_memberships,
    })
}

fn query_all<T, F>(connection: &Connection, sql: &str, map: F) -> Result<Vec<T>, String>
where
    F: FnMut(&Row<'_>) -> rusqlite::Result<T>,
{
    let mut statement = connection
        .prepare(sql)
        .map_err(|error| format!("Unable to prepare World DB selection query: {error}"))?;
    let rows = statement
        .query_map([], map)
        .map_err(|error| format!("Unable to query World DB selection catalog: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB selection row: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_canonical_selection_hierarchy_deterministically() {
        let connection = Connection::open_in_memory().expect("open in-memory sqlite");
        connection
            .execute_batch(
                r#"
                CREATE TABLE entity(entity_id TEXT PRIMARY KEY, canonical_name TEXT NOT NULL);
                CREATE TABLE competition(competition_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL);
                CREATE TABLE team(team_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL);
                CREATE TABLE competition_ecosystem(competition_ecosystem_id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, gender TEXT);
                CREATE TABLE ecosystem_level(ecosystem_level_id TEXT PRIMARY KEY, competition_ecosystem_id TEXT NOT NULL, parent_level_id TEXT, level_code TEXT NOT NULL, name TEXT NOT NULL, tier_order INTEGER);
                CREATE TABLE ecosystem_unit(ecosystem_unit_id TEXT PRIMARY KEY, competition_ecosystem_id TEXT NOT NULL, ecosystem_level_id TEXT, parent_unit_id TEXT, organization_id TEXT, unit_type TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL);
                CREATE TABLE ecosystem_competition_assignment(ecosystem_competition_assignment_id TEXT PRIMARY KEY, competition_ecosystem_id TEXT NOT NULL, competition_id TEXT NOT NULL, ecosystem_level_id TEXT, ecosystem_unit_id TEXT, role_type TEXT NOT NULL);
                CREATE TABLE competition_season(competition_season_id TEXT PRIMARY KEY, competition_id TEXT NOT NULL, season_id TEXT NOT NULL, edition_number INTEGER);
                CREATE TABLE team_ecosystem_membership(team_ecosystem_membership_id TEXT PRIMARY KEY, competition_ecosystem_id TEXT NOT NULL, team_id TEXT NOT NULL, ecosystem_level_id TEXT, membership_status TEXT NOT NULL, valid_from TEXT, valid_to TEXT);
                CREATE TABLE team_ecosystem_unit_membership(team_ecosystem_unit_membership_id TEXT PRIMARY KEY, ecosystem_unit_id TEXT NOT NULL, team_id TEXT NOT NULL, membership_status TEXT NOT NULL, valid_from TEXT, valid_to TEXT);

                INSERT INTO entity VALUES ('entity:competition', 'Liga Endesa');
                INSERT INTO entity VALUES ('entity:team', 'Real Madrid');
                INSERT INTO competition VALUES ('competition:ESP:liga-endesa', 'entity:competition');
                INSERT INTO team VALUES ('team:ESP:real-madrid', 'entity:team');
                INSERT INTO competition_ecosystem VALUES ('ecosystem:ESP:acb', 'ESP_ACB', 'Spain ACB', 'M');
                INSERT INTO ecosystem_level VALUES ('ecosystem-level:ESP:acb:1', 'ecosystem:ESP:acb', NULL, '1', 'Liga Endesa', 1);
                INSERT INTO ecosystem_unit VALUES ('ecosystem-unit:ESP:acb:national', 'ecosystem:ESP:acb', 'ecosystem-level:ESP:acb:1', NULL, NULL, 'NATIONAL', 'NATIONAL', 'National');
                INSERT INTO ecosystem_competition_assignment VALUES ('assignment:acb', 'ecosystem:ESP:acb', 'competition:ESP:liga-endesa', 'ecosystem-level:ESP:acb:1', NULL, 'PRIMARY_LEAGUE');
                INSERT INTO competition_season VALUES ('edition:ESP:liga-endesa:2025-26', 'competition:ESP:liga-endesa', 'season:2025-26', 70);
                INSERT INTO team_ecosystem_membership VALUES ('membership:team', 'ecosystem:ESP:acb', 'team:ESP:real-madrid', 'ecosystem-level:ESP:acb:1', 'ACTIVE', '2025-07-01', '2026-06-30');
                INSERT INTO team_ecosystem_unit_membership VALUES ('membership:unit', 'ecosystem-unit:ESP:acb:national', 'team:ESP:real-madrid', 'ACTIVE', '2025-07-01', '2026-06-30');
                "#,
            )
            .expect("seed selection schema");

        let catalog = read_selection_catalog(
            &connection,
            WorldDbSelectionSourceV1 {
                database_id: "phase1a.db".to_owned(),
                schema_id: WORLD_DB_SCHEMA_ID.to_owned(),
            },
        )
        .expect("read selection catalog");

        assert_eq!(catalog.ecosystems.len(), 1);
        assert_eq!(catalog.competition_assignments.len(), 1);
        assert_eq!(catalog.competition_seasons.len(), 1);
        assert_eq!(catalog.team_memberships.len(), 1);
        assert_eq!(catalog.team_unit_memberships.len(), 1);
        assert_eq!(
            catalog.competition_assignments[0].competition_name,
            "Liga Endesa"
        );
        assert_eq!(catalog.team_memberships[0].team_name, "Real Madrid");
    }
}
