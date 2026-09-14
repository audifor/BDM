use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbMatchV1 {
    match_id: String,
    competition_season_id: String,
    scheduled_at: Option<String>,
    played_at: Option<String>,
    facility_id: Option<String>,
    status: String,
    home_team_id: String,
    away_team_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameFixtureRealizationV1 {
    game_fixture_realization_id: String,
    match_id: String,
    competition_fixture_id: String,
    realization_type: String,
    status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbMatchRealizationBundleV1 {
    schema_version: u8,
    competition_season_id: String,
    matches: Vec<WorldDbMatchV1>,
    realizations: Vec<WorldDbGameFixtureRealizationV1>,
}

pub fn load_match_realizations_v1(
    database_path: &str,
    competition_season_id: &str,
) -> Result<WorldDbMatchRealizationBundleV1, String> {
    if competition_season_id.trim().is_empty() {
        return Err("competitionSeasonId must be non-empty".to_owned());
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

    if !table_exists(&connection, "match")?
        || !table_exists(&connection, "game_fixture_realization")?
    {
        return Ok(WorldDbMatchRealizationBundleV1 {
            schema_version: 1,
            competition_season_id: competition_season_id.to_owned(),
            matches: Vec::new(),
            realizations: Vec::new(),
        });
    }

    let matches = query_many(
        &connection,
        "SELECT DISTINCT m.match_id, m.competition_season_id, m.scheduled_at, m.played_at, m.facility_id, m.status, m.home_team_id, m.away_team_id FROM match m JOIN game_fixture_realization r ON r.match_id = m.match_id JOIN competition_fixture f ON f.competition_fixture_id = r.competition_fixture_id WHERE f.competition_season_id = ?1 ORDER BY m.match_id",
        competition_season_id,
        |row| {
            Ok(WorldDbMatchV1 {
                match_id: row.get(0)?,
                competition_season_id: row.get(1)?,
                scheduled_at: row.get(2)?,
                played_at: row.get(3)?,
                facility_id: row.get(4)?,
                status: row.get(5)?,
                home_team_id: row.get(6)?,
                away_team_id: row.get(7)?,
            })
        },
    )?;

    let realizations = query_many(
        &connection,
        "SELECT r.game_fixture_realization_id, r.match_id, r.competition_fixture_id, r.realization_type, r.status FROM game_fixture_realization r JOIN competition_fixture f ON f.competition_fixture_id = r.competition_fixture_id WHERE f.competition_season_id = ?1 ORDER BY r.match_id, r.competition_fixture_id, r.game_fixture_realization_id",
        competition_season_id,
        |row| {
            Ok(WorldDbGameFixtureRealizationV1 {
                game_fixture_realization_id: row.get(0)?,
                match_id: row.get(1)?,
                competition_fixture_id: row.get(2)?,
                realization_type: row.get(3)?,
                status: row.get(4)?,
            })
        },
    )?;

    Ok(WorldDbMatchRealizationBundleV1 {
        schema_version: 1,
        competition_season_id: competition_season_id.to_owned(),
        matches,
        realizations,
    })
}

fn query_many<T, F>(
    connection: &Connection,
    sql: &str,
    competition_season_id: &str,
    mut map: F,
) -> Result<Vec<T>, String>
where
    F: FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
{
    let mut statement = connection
        .prepare(sql)
        .map_err(|error| format!("Unable to prepare World DB match query: {error}"))?;
    let rows = statement
        .query_map([competition_season_id], |row| map(row))
        .map_err(|error| format!("Unable to query World DB matches: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB match row: {error}"))
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
