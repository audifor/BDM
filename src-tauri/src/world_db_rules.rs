use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Map, Value};

pub fn load_rule_payloads(
    connection: &Connection,
    competition_season_id: &str,
) -> Result<Map<String, Value>, String> {
    let mut result = Map::new();

    insert_family(
        &mut result,
        "pairing",
        query_json_rows(
            connection,
            "SELECT competition_pairing_rule_id, scope_structure_node_id, pairing_type, rule_payload_json FROM competition_pairing_rule WHERE competition_season_id = ?1 ORDER BY competition_pairing_rule_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "scopeStructureNodeId": row.get::<_, Option<String>>(1)?,
                    "type": row.get::<_, String>(2)?,
                    "payload": parse_optional_json(row.get::<_, Option<String>>(3)?)?,
                }))
            },
        )?,
    );
    insert_family(
        &mut result,
        "opponentScope",
        query_json_rows(
            connection,
            "SELECT competition_opponent_scope_rule_id, scope_structure_node_id, rule_type, rule_payload_json FROM competition_opponent_scope_rule WHERE competition_season_id = ?1 ORDER BY competition_opponent_scope_rule_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "scopeStructureNodeId": row.get::<_, Option<String>>(1)?,
                    "type": row.get::<_, String>(2)?,
                    "payload": parse_optional_json(row.get::<_, Option<String>>(3)?)?,
                }))
            },
        )?,
    );
    insert_family(
        &mut result,
        "hosting",
        query_json_rows(
            connection,
            "SELECT competition_contest_hosting_rule_id, scope_structure_node_id, rule_type, rule_payload_json FROM competition_contest_hosting_rule WHERE competition_season_id = ?1 ORDER BY competition_contest_hosting_rule_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "scopeStructureNodeId": row.get::<_, Option<String>>(1)?,
                    "type": row.get::<_, String>(2)?,
                    "payload": parse_optional_json(row.get::<_, Option<String>>(3)?)?,
                }))
            },
        )?,
    );
    insert_family(
        &mut result,
        "progressionRules",
        query_json_rows(
            connection,
            "SELECT competition_progression_rule_id, scope_structure_node_id, rule_type, rule_payload_json FROM competition_progression_rule WHERE competition_season_id = ?1 ORDER BY competition_progression_rule_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "scopeStructureNodeId": row.get::<_, Option<String>>(1)?,
                    "type": row.get::<_, String>(2)?,
                    "payload": parse_optional_json(row.get::<_, Option<String>>(3)?)?,
                }))
            },
        )?,
    );
    insert_family(
        &mut result,
        "progressionConditions",
        query_json_rows(
            connection,
            "SELECT c.competition_progression_condition_id, c.competition_progression_rule_id, c.sequence_no, c.condition_or_destination_type, c.payload_json FROM competition_progression_condition c JOIN competition_progression_rule r ON r.competition_progression_rule_id = c.competition_progression_rule_id WHERE r.competition_season_id = ?1 ORDER BY c.competition_progression_rule_id, c.sequence_no, c.competition_progression_condition_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "ruleId": row.get::<_, String>(1)?,
                    "sequenceNo": row.get::<_, i64>(2)?,
                    "type": row.get::<_, String>(3)?,
                    "payload": parse_optional_json(row.get::<_, Option<String>>(4)?)?,
                }))
            },
        )?,
    );
    insert_family(
        &mut result,
        "progressionDestinations",
        query_json_rows(
            connection,
            "SELECT d.competition_progression_destination_id, d.competition_progression_rule_id, d.sequence_no, d.condition_or_destination_type, d.payload_json FROM competition_progression_destination d JOIN competition_progression_rule r ON r.competition_progression_rule_id = d.competition_progression_rule_id WHERE r.competition_season_id = ?1 ORDER BY d.competition_progression_rule_id, d.sequence_no, d.competition_progression_destination_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "ruleId": row.get::<_, String>(1)?,
                    "sequenceNo": row.get::<_, i64>(2)?,
                    "type": row.get::<_, String>(3)?,
                    "payload": parse_optional_json(row.get::<_, Option<String>>(4)?)?,
                }))
            },
        )?,
    );
    insert_family(
        &mut result,
        "entrySelectionProcesses",
        query_json_rows(
            connection,
            "SELECT competition_entry_selection_process_id, method FROM competition_entry_selection_process WHERE competition_season_id = ?1 ORDER BY competition_entry_selection_process_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "method": row.get::<_, String>(1)?,
                }))
            },
        )?,
    );
    insert_family(
        &mut result,
        "entrySelectionCriteria",
        query_json_rows(
            connection,
            "SELECT c.competition_entry_selection_criterion_id, c.competition_entry_selection_process_id, c.sequence_no, c.rule_type, c.rule_payload_json FROM competition_entry_selection_criterion c JOIN competition_entry_selection_process p ON p.competition_entry_selection_process_id = c.competition_entry_selection_process_id WHERE p.competition_season_id = ?1 ORDER BY c.competition_entry_selection_process_id, c.sequence_no, c.competition_entry_selection_criterion_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "processId": row.get::<_, String>(1)?,
                    "sequenceNo": row.get::<_, i64>(2)?,
                    "type": row.get::<_, String>(3)?,
                    "payload": parse_optional_json(row.get::<_, Option<String>>(4)?)?,
                }))
            },
        )?,
    );
    insert_family(
        &mut result,
        "seedingSchemes",
        query_json_rows(
            connection,
            "SELECT competition_seeding_scheme_id, scheme_type, name FROM competition_seeding_scheme WHERE competition_season_id = ?1 ORDER BY competition_seeding_scheme_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "type": row.get::<_, String>(1)?,
                    "name": row.get::<_, Option<String>>(2)?,
                }))
            },
        )?,
    );
    insert_family(
        &mut result,
        "seedingBasis",
        query_json_rows(
            connection,
            "SELECT b.competition_seeding_basis_id, b.competition_seeding_scheme_id, b.basis_type, b.priority, b.basis_payload_json FROM competition_seeding_basis b JOIN competition_seeding_scheme s ON s.competition_seeding_scheme_id = b.competition_seeding_scheme_id WHERE s.competition_season_id = ?1 ORDER BY b.competition_seeding_scheme_id, b.priority, b.competition_seeding_basis_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "schemeId": row.get::<_, String>(1)?,
                    "type": row.get::<_, String>(2)?,
                    "priority": row.get::<_, i64>(3)?,
                    "payload": parse_optional_json(row.get::<_, Option<String>>(4)?)?,
                }))
            },
        )?,
    );
    insert_family(
        &mut result,
        "contestFormats",
        query_json_rows(
            connection,
            "SELECT competition_contest_format_id, scope_structure_node_id, format_type, name FROM competition_contest_format WHERE competition_season_id = ?1 ORDER BY competition_contest_format_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "scopeStructureNodeId": row.get::<_, Option<String>>(1)?,
                    "type": row.get::<_, String>(2)?,
                    "name": row.get::<_, Option<String>>(3)?,
                }))
            },
        )?,
    );
    insert_family(
        &mut result,
        "singleGameFormats",
        query_json_rows(
            connection,
            "SELECT g.single_game_format_id, g.competition_contest_format_id, g.requires_winner FROM single_game_format g JOIN competition_contest_format f ON f.competition_contest_format_id = g.competition_contest_format_id WHERE f.competition_season_id = ?1 ORDER BY g.single_game_format_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "contestFormatId": row.get::<_, String>(1)?,
                    "requiresWinner": row.get::<_, i64>(2)? != 0,
                }))
            },
        )?,
    );
    insert_family(
        &mut result,
        "seriesFormats",
        query_json_rows(
            connection,
            "SELECT s.competition_series_format_id, s.competition_contest_format_id, s.best_of_games, s.wins_required_default FROM competition_series_format s JOIN competition_contest_format f ON f.competition_contest_format_id = s.competition_contest_format_id WHERE f.competition_season_id = ?1 ORDER BY s.competition_series_format_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "contestFormatId": row.get::<_, String>(1)?,
                    "bestOfGames": row.get::<_, Option<i64>>(2)?,
                    "winsRequiredDefault": row.get::<_, Option<i64>>(3)?,
                }))
            },
        )?,
    );
    insert_family(
        &mut result,
        "seriesHostingPatterns",
        query_json_rows(
            connection,
            "SELECT h.competition_series_hosting_pattern_id, h.competition_series_format_id, h.pattern, h.priority_basis FROM competition_series_hosting_pattern h JOIN competition_series_format s ON s.competition_series_format_id = h.competition_series_format_id JOIN competition_contest_format f ON f.competition_contest_format_id = s.competition_contest_format_id WHERE f.competition_season_id = ?1 ORDER BY h.competition_series_hosting_pattern_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "seriesFormatId": row.get::<_, String>(1)?,
                    "pattern": row.get::<_, String>(2)?,
                    "priorityBasis": row.get::<_, Option<String>>(3)?,
                }))
            },
        )?,
    );

    if table_exists(connection, "competition_contest_initial_score_rule")? {
        insert_family(
            &mut result,
            "initialScore",
            query_json_rows(
                connection,
                "SELECT competition_contest_initial_score_rule_id, scope_structure_node_id, rule_type, priority, composition_mode, rule_payload_json FROM competition_contest_initial_score_rule WHERE competition_season_id = ?1 ORDER BY priority, competition_contest_initial_score_rule_id",
                competition_season_id,
                |row| {
                    Ok(json!({
                        "id": row.get::<_, String>(0)?,
                        "scopeStructureNodeId": row.get::<_, Option<String>>(1)?,
                        "type": row.get::<_, String>(2)?,
                        "priority": row.get::<_, i64>(3)?,
                        "compositionMode": row.get::<_, String>(4)?,
                        "payload": parse_optional_json(row.get::<_, Option<String>>(5)?)?,
                    }))
                },
            )?,
        );
    }

    Ok(result)
}

fn insert_family(target: &mut Map<String, Value>, key: &str, rows: Vec<Value>) {
    target.insert(key.to_owned(), Value::Array(rows));
}

fn query_json_rows<F>(
    connection: &Connection,
    sql: &str,
    competition_season_id: &str,
    mut map: F,
) -> Result<Vec<Value>, String>
where
    F: FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<Value>,
{
    let mut statement = connection
        .prepare(sql)
        .map_err(|error| format!("Unable to prepare World DB rules query: {error}"))?;
    let rows = statement
        .query_map([competition_season_id], |row| map(row))
        .map_err(|error| format!("Unable to query World DB rules: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB rule row: {error}"))
}

fn parse_optional_json(value: Option<String>) -> rusqlite::Result<Value> {
    match value {
        None => Ok(Value::Null),
        Some(text) => serde_json::from_str(&text).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        }),
    }
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
