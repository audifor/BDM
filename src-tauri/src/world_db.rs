use crate::world_db_rules::load_rule_payloads;
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
pub struct WorldDbStructurePositionV1 {
    competition_structure_position_id: String,
    competition_structure_node_id: String,
    position_type: String,
    position_order: Option<i64>,
    label: Option<String>,
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
pub struct WorldDbScheduleBlockV1 {
    competition_schedule_block_id: String,
    block_type: String,
    name: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbScheduleSessionV1 {
    competition_schedule_session_id: String,
    competition_schedule_block_id: String,
    name: Option<String>,
    session_order: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbScheduleSlotV1 {
    competition_schedule_slot_id: String,
    schedule_block_id: Option<String>,
    schedule_session_id: Option<String>,
    slot_order: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbScheduleSlotTimingV1 {
    competition_schedule_slot_timing_history_id: String,
    competition_schedule_slot_id: String,
    timing_state: String,
    local_date: Option<String>,
    local_time: Option<String>,
    time_zone: Option<String>,
    valid_from: Option<String>,
    valid_to: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbFixtureScheduleAllocationV1 {
    competition_fixture_schedule_allocation_id: String,
    competition_fixture_id: String,
    competition_schedule_slot_id: String,
    status: String,
    valid_from: Option<String>,
    valid_to: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbCompetitionBundleV1 {
    schema_version: u8,
    source: WorldDbSourceRefV1,
    competition_season: WorldDbCompetitionSeasonV1,
    entries: Vec<WorldDbCompetitionEntryV1>,
    structure_nodes: Vec<WorldDbStructureNodeV1>,
    structure_positions: Vec<WorldDbStructurePositionV1>,
    structure_edges: Vec<WorldDbStructureEdgeV1>,
    structure_entry_assignments: Vec<WorldDbStructureEntryAssignmentV1>,
    fixtures: Vec<WorldDbFixtureV1>,
    fixture_sides: Vec<WorldDbFixtureSideV1>,
    schedule_blocks: Vec<WorldDbScheduleBlockV1>,
    schedule_sessions: Vec<WorldDbScheduleSessionV1>,
    schedule_slots: Vec<WorldDbScheduleSlotV1>,
    schedule_slot_timings: Vec<WorldDbScheduleSlotTimingV1>,
    fixture_schedule_allocations: Vec<WorldDbFixtureScheduleAllocationV1>,
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
        .map_err(|error| {
            format!("Unable to load competition season {competition_season_id}: {error}")
        })?;

    let entries = query_many(
        &connection,
        "SELECT competition_season_entry_id, team_id FROM competition_season_entry WHERE competition_season_id = ?1 ORDER BY competition_season_entry_id",
        competition_season_id,
        |row| Ok(WorldDbCompetitionEntryV1 {
            competition_season_entry_id: row.get(0)?,
            team_id: row.get(1)?,
        }),
    )?;
    let structure_nodes = query_many(
        &connection,
        "SELECT competition_structure_node_id, node_type, name, sequence_no FROM competition_structure_node WHERE competition_season_id = ?1 ORDER BY COALESCE(sequence_no, 2147483647), competition_structure_node_id",
        competition_season_id,
        |row| Ok(WorldDbStructureNodeV1 {
            competition_structure_node_id: row.get(0)?,
            node_type: row.get(1)?,
            name: row.get(2)?,
            sequence_no: row.get(3)?,
        }),
    )?;
    let structure_positions = query_many(
        &connection,
        "SELECT p.competition_structure_position_id, p.competition_structure_node_id, p.position_type, p.position_order, p.label FROM competition_structure_position p JOIN competition_structure_node n ON n.competition_structure_node_id = p.competition_structure_node_id WHERE n.competition_season_id = ?1 ORDER BY p.competition_structure_node_id, COALESCE(p.position_order, 2147483647), p.competition_structure_position_id",
        competition_season_id,
        |row| Ok(WorldDbStructurePositionV1 {
            competition_structure_position_id: row.get(0)?,
            competition_structure_node_id: row.get(1)?,
            position_type: row.get(2)?,
            position_order: row.get(3)?,
            label: row.get(4)?,
        }),
    )?;
    let structure_edges = query_many(
        &connection,
        "SELECT r.from_node_id, r.to_node_id, r.relationship_type FROM competition_structure_relationship r JOIN competition_structure_node n ON n.competition_structure_node_id = r.from_node_id WHERE n.competition_season_id = ?1 ORDER BY r.competition_structure_relationship_id",
        competition_season_id,
        |row| Ok(WorldDbStructureEdgeV1 {
            from_node_id: row.get(0)?,
            to_node_id: row.get(1)?,
            relationship_type: row.get(2)?,
        }),
    )?;
    let structure_entry_assignments = query_many(
        &connection,
        "SELECT a.competition_structure_node_id, a.competition_season_entry_id, a.valid_from, a.valid_to FROM competition_structure_entry_assignment a JOIN competition_structure_node n ON n.competition_structure_node_id = a.competition_structure_node_id WHERE n.competition_season_id = ?1 ORDER BY a.competition_structure_entry_assignment_id",
        competition_season_id,
        |row| Ok(WorldDbStructureEntryAssignmentV1 {
            competition_structure_node_id: row.get(0)?,
            competition_season_entry_id: row.get(1)?,
            valid_from: row.get(2)?,
            valid_to: row.get(3)?,
        }),
    )?;
    let fixtures = query_many(
        &connection,
        "SELECT competition_fixture_id, structure_node_id, matchday_id, fixture_order FROM competition_fixture WHERE competition_season_id = ?1 ORDER BY COALESCE(fixture_order, 2147483647), competition_fixture_id",
        competition_season_id,
        |row| Ok(WorldDbFixtureV1 {
            competition_fixture_id: row.get(0)?,
            structure_node_id: row.get(1)?,
            matchday_id: row.get(2)?,
            fixture_order: row.get(3)?,
        }),
    )?;
    let fixture_sides = query_many(
        &connection,
        "SELECT s.competition_fixture_side_id, s.competition_fixture_id, s.side_role, s.competition_season_entry_id, s.competition_season_slot_id, s.source_structure_position_id FROM competition_fixture_side s JOIN competition_fixture f ON f.competition_fixture_id = s.competition_fixture_id WHERE f.competition_season_id = ?1 ORDER BY s.competition_fixture_id, s.competition_fixture_side_id",
        competition_season_id,
        |row| Ok(WorldDbFixtureSideV1 {
            competition_fixture_side_id: row.get(0)?,
            competition_fixture_id: row.get(1)?,
            side_role: row.get(2)?,
            competition_season_entry_id: row.get(3)?,
            competition_season_slot_id: row.get(4)?,
            source_structure_position_id: row.get(5)?,
        }),
    )?;
    let schedule_blocks = query_many(
        &connection,
        "SELECT competition_schedule_block_id, block_type, name, start_date, end_date FROM competition_schedule_block WHERE competition_season_id = ?1 ORDER BY COALESCE(start_date, '9999-12-31'), competition_schedule_block_id",
        competition_season_id,
        |row| Ok(WorldDbScheduleBlockV1 {
            competition_schedule_block_id: row.get(0)?,
            block_type: row.get(1)?,
            name: row.get(2)?,
            start_date: row.get(3)?,
            end_date: row.get(4)?,
        }),
    )?;
    let schedule_sessions = query_many(
        &connection,
        "SELECT s.competition_schedule_session_id, s.competition_schedule_block_id, s.name, s.session_order FROM competition_schedule_session s JOIN competition_schedule_block b ON b.competition_schedule_block_id = s.competition_schedule_block_id WHERE b.competition_season_id = ?1 ORDER BY s.competition_schedule_block_id, COALESCE(s.session_order, 2147483647), s.competition_schedule_session_id",
        competition_season_id,
        |row| Ok(WorldDbScheduleSessionV1 {
            competition_schedule_session_id: row.get(0)?,
            competition_schedule_block_id: row.get(1)?,
            name: row.get(2)?,
            session_order: row.get(3)?,
        }),
    )?;
    let schedule_slots = query_many(
        &connection,
        "SELECT competition_schedule_slot_id, schedule_block_id, schedule_session_id, slot_order FROM competition_schedule_slot WHERE competition_season_id = ?1 ORDER BY COALESCE(slot_order, 2147483647), competition_schedule_slot_id",
        competition_season_id,
        |row| Ok(WorldDbScheduleSlotV1 {
            competition_schedule_slot_id: row.get(0)?,
            schedule_block_id: row.get(1)?,
            schedule_session_id: row.get(2)?,
            slot_order: row.get(3)?,
        }),
    )?;
    let schedule_slot_timings = query_many(
        &connection,
        "SELECT h.competition_schedule_slot_timing_history_id, h.competition_schedule_slot_id, h.timing_state, h.local_date, h.local_time, h.time_zone, h.valid_from, h.valid_to FROM competition_schedule_slot_timing_history h JOIN competition_schedule_slot s ON s.competition_schedule_slot_id = h.competition_schedule_slot_id WHERE s.competition_season_id = ?1 ORDER BY h.competition_schedule_slot_id, COALESCE(h.valid_from, ''), h.competition_schedule_slot_timing_history_id",
        competition_season_id,
        |row| Ok(WorldDbScheduleSlotTimingV1 {
            competition_schedule_slot_timing_history_id: row.get(0)?,
            competition_schedule_slot_id: row.get(1)?,
            timing_state: row.get(2)?,
            local_date: row.get(3)?,
            local_time: row.get(4)?,
            time_zone: row.get(5)?,
            valid_from: row.get(6)?,
            valid_to: row.get(7)?,
        }),
    )?;
    let fixture_schedule_allocations = query_many(
        &connection,
        "SELECT a.competition_fixture_schedule_allocation_id, a.competition_fixture_id, a.competition_schedule_slot_id, a.status, a.valid_from, a.valid_to FROM competition_fixture_schedule_allocation a JOIN competition_fixture f ON f.competition_fixture_id = a.competition_fixture_id WHERE f.competition_season_id = ?1 ORDER BY a.competition_fixture_id, COALESCE(a.valid_from, ''), a.competition_fixture_schedule_allocation_id",
        competition_season_id,
        |row| Ok(WorldDbFixtureScheduleAllocationV1 {
            competition_fixture_schedule_allocation_id: row.get(0)?,
            competition_fixture_id: row.get(1)?,
            competition_schedule_slot_id: row.get(2)?,
            status: row.get(3)?,
            valid_from: row.get(4)?,
            valid_to: row.get(5)?,
        }),
    )?;
    let rule_payloads = load_rule_payloads(&connection, competition_season_id)?;

    Ok(WorldDbCompetitionBundleV1 {
        schema_version: 1,
        source: WorldDbSourceRefV1 {
            database_id: path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("bdm-world.db")
                .to_owned(),
            schema_id: "DDL-PHASE1-A".to_owned(),
        },
        competition_season,
        entries,
        structure_nodes,
        structure_positions,
        structure_edges,
        structure_entry_assignments,
        fixtures,
        fixture_sides,
        schedule_blocks,
        schedule_sessions,
        schedule_slots,
        schedule_slot_timings,
        fixture_schedule_allocations,
        rule_payloads,
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
