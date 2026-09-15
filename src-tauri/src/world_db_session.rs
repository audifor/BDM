use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use std::path::Path;

const WORLD_DB_SCHEMA_ID: &str = "DDL-PHASE1-A";
const REQUIRED_TABLES: &[&str] = &[
    "team",
    "competition",
    "competition_season",
    "competition_season_entry",
    "competition_fixture",
    "competition_fixture_side",
    "match",
    "game_fixture_realization",
    "person",
    "player",
    "staff",
    "competition_ecosystem",
    "ecosystem_level",
    "ecosystem_unit",
    "ecosystem_competition_assignment",
    "team_ecosystem_membership",
    "team_ecosystem_unit_membership",
    "competition_contest_start_rule",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbDatabaseSourceV1 {
    database_id: String,
    schema_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbDatabaseInfoV1 {
    schema_version: u8,
    source: WorldDbDatabaseSourceV1,
    competition_season_ids: Vec<String>,
}

pub fn inspect_database_v1(database_path: &str) -> Result<WorldDbDatabaseInfoV1, String> {
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

    for table in REQUIRED_TABLES {
        if !table_exists(&connection, table)? {
            return Err(format!(
                "Incompatible World DB: required table is missing: {table}"
            ));
        }
    }
    if !column_exists(
        &connection,
        "competition_group",
        "source_ecosystem_unit_id",
    )? {
        return Err(
            "Incompatible World DB: competition_group.source_ecosystem_unit_id is missing"
                .to_owned(),
        );
    }

    let mut statement = connection
        .prepare(
            "SELECT competition_season_id FROM competition_season ORDER BY competition_season_id",
        )
        .map_err(|error| format!("Unable to prepare World DB season discovery: {error}"))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("Unable to query World DB seasons: {error}"))?;
    let competition_season_ids = rows
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB season row: {error}"))?;

    Ok(WorldDbDatabaseInfoV1 {
        schema_version: 1,
        source: WorldDbDatabaseSourceV1 {
            database_id: path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("bdm-world.db")
                .to_owned(),
            schema_id: WORLD_DB_SCHEMA_ID.to_owned(),
        },
        competition_season_ids,
    })
}

fn table_exists(connection: &Connection, table: &str) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [table],
            |_| Ok(true),
        )
        .optional()
        .map(|value| value.unwrap_or(false))
        .map_err(|error| format!("Unable to inspect World DB schema: {error}"))
}

fn column_exists(connection: &Connection, table: &str, column: &str) -> Result<bool, String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info(\"{table}\")"))
        .map_err(|error| format!("Unable to inspect World DB table {table}: {error}"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("Unable to inspect World DB columns for {table}: {error}"))?;
    for value in columns {
        if value.map_err(|error| format!("Unable to decode World DB column: {error}"))? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_missing_database_file() {
        assert!(inspect_database_v1("__bdm_missing_world_db__.sqlite").is_err());
    }

    #[test]
    fn rejects_empty_database_path() {
        assert!(inspect_database_v1("   ").is_err());
    }
}
