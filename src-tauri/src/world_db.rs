use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use serde_json::{Map, Value};
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbSourceRefV1 {
    database_id: String,
    schema_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbCompetitionSeasonV1 {
    competition_season_id: String,
    competition_id: String,
    season_id: String,
    edition_number: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbCompetitionEntryV1 {
    competition_season_entry_id: String,
    team_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbStructureNodeV1 {
    competition_structure_node_id: String,
    node_type: String,
    name: Option<String>,
    sequence_no: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbStructureEdgeV1 {
    from_node_id: String,
    to_node_id: String,
    relationship_type: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbStructureEntryAssignmentV1 {
    competition_structure_node_id: String,
    competition_season_entry_id: String,
    valid_from: Option<String>,
    valid_to: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbFixtureV1 {
    competition_fixture_id: String,
    structure_node_id: Option<String>,
    matchday_id: Option<String>,
    fixture_order: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbFixtureSideV1 {
    competition_fixture_side_id: String,
    competition_fixture_id: String,
    side_role: String,
    competition_season_entry_id: Option<String>,
    competition_season_slot_id: Option<String>,
    source_structure_position_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbCompetitionBundleV1 {
    schema_version: u8,
    source: WorldDbSourceRefV1,
    competition_season: WorldDbCompetitionSeasonV1,
    entries: Vec<WorldDbCompetitionEntryV1>,
    structure_nodes: Vec<WorldDbStructureNodeV1>,
    structure_edges: Vec<WorldDbStructureEdgeV1>,
    structure_entry_assignments: Vec<WorldDbStructureEntryAssignmentV1>,
    fixtures: Vec<WorldDbFixtureV1>,
    fixture_sides: Vec<WorldDbFixtureSideV1>,
    rule_payloads: Map<String, Value>,
}

pub fn load_competition_bundle_v1(
    database_path: &str,
    competition_season_id: &str,
) -> Result<WorldDbCompetitionBundleV1, String> {
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

    let competition_season = connection
        .query_row(
            "SELECT competition_season_id, competition_id, season_id, edition_number FROM competition_season WHERE competition_season_id = ?1",
            [competition_season_id],
            |row| {
                Ok(WorldDbCompetitionSeasonV1 {
                    competition_season_id: row.get(0)?,
                    competition_id: row.get(1)?,
                    season_id: row.get(2)?,
                    edition_number: row.get(3)?,
                })
            },
        )
        .map_err(|error| format!("Unable to load competition season {competition_season_id}: {error}"))?;

    let entries = query_many(
        &connection,
        "SELECT competition_season_entry_id, team_id FROM competition_season_entry WHERE competition_season_id = ?1 ORDER BY competition_season_entry_id",
        competition_season_id,
        |row| Ok(WorldDbCompetitionEntryV1 { competition_season_entry_id: row.get(0)?, team_id: row.get(1)? }),
    )?;
    let structure_nodes = query_many(
        &connection,
        "SELECT competition_structure_node_id, node_type, name, sequence_no FROM competition_structure_node WHERE competition_season_id = ?1 ORDER BY COALESCE(sequence_no, 2147483647), competition_structure_node_id",
        competition_season_id,
        |row| Ok(WorldDbStructureNodeV1 { competition_structure_node_id: row.get(0)?, node_type: row.get(1)?, name: row.get(2)?, sequence_no: row.get(3)? }),
    )?;
    let structure_edges = query_many(
        &connection,
        "SELECT r.from_node_id, r.to_node_id, r.relationship_type FROM competition_structure_relationship r JOIN competition_structure_node n ON n.competition_structure_node_id = r.from_node_id WHERE n.competition_season_id = ?1 ORDER BY r.competition_structure_relationship_id",
        competition_season_id,
        |row| Ok(WorldDbStructureEdgeV1 { from_node_id: row.get(0)?, to_node_id: row.get(1)?, relationship_type: row.get(2)? }),
    )?;
    let structure_entry_assignments = query_many(
        &connection,
        "SELECT a.competition_structure_node_id, a.competition_season_entry_id, a.valid_from, a.valid_to FROM competition_structure_entry_assignment a JOIN competition_structure_node n ON n.competition_structure_node_id = a.competition_structure_node_id WHERE n.competition_season_id = ?1 ORDER BY a.competition_structure_entry_assignment_id",
        competition_season_id,
        |row| Ok(WorldDbStructureEntryAssignmentV1 { competition_structure_node_id: row.get(0)?, competition_season_entry_id: row.get(1)?, valid_from: row.get(2)?, valid_to: row.get(3)? }),
    )?;
    let fixtures = query_many(
        &connection,
        "SELECT competition_fixture_id, structure_node_id, matchday_id, fixture_order FROM competition_fixture WHERE competition_season_id = ?1 ORDER BY COALESCE(fixture_order, 2147483647), competition_fixture_id",
        competition_season_id,
        |row| Ok(WorldDbFixtureV1 { competition_fixture_id: row.get(0)?, structure_node_id: row.get(1)?, matchday_id: row.get(2)?, fixture_order: row.get(3)? }),
    )?;
    let fixture_sides = query_many(
        &connection,
        "SELECT s.competition_fixture_side_id, s.competition_fixture_id, s.side_role, s.competition_season_entry_id, s.competition_season_slot_id, s.source_structure_position_id FROM competition_fixture_side s JOIN competition_fixture f ON f.competition_fixture_id = s.competition_fixture_id WHERE f.competition_season_id = ?1 ORDER BY s.competition_fixture_id, s.competition_fixture_side_id",
        competition_season_id,
        |row| Ok(WorldDbFixtureSideV1 { competition_fixture_side_id: row.get(0)?, competition_fixture_id: row.get(1)?, side_role: row.get(2)?, competition_season_entry_id: row.get(3)?, competition_season_slot_id: row.get(4)?, source_structure_position_id: row.get(5)? }),
    )?;

    Ok(WorldDbCompetitionBundleV1 {
        schema_version: 1,
        source: WorldDbSourceRefV1 {
            database_id: path.file_name().and_then(|name| name.to_str()).unwrap_or("bdm-world.db").to_owned(),
            schema_id: "DDL-PHASE1-A".to_owned(),
        },
        competition_season,
        entries,
        structure_nodes,
        structure_edges,
        structure_entry_assignments,
        fixtures,
        fixture_sides,
        rule_payloads: Map::new(),
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
        .map_err(|error| format!("Unable to prepare World DB query: {error}"))?;
    let rows = statement
        .query_map([competition_season_id], |row| map(row))
        .map_err(|error| format!("Unable to query World DB: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB row: {error}"))
}
