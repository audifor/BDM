use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Map, Value};

pub fn append_standing_rule_payloads(
    connection: &Connection,
    competition_season_id: &str,
    target: &mut Map<String, Value>,
) -> Result<(), String> {
    if !table_exists(connection, "competition_standing_scheme")? {
        return Ok(());
    }

    insert_family(
        target,
        "standingSchemes",
        query_json_rows(
            connection,
            "SELECT competition_standing_scheme_id, name FROM competition_standing_scheme WHERE competition_season_id = ?1 ORDER BY competition_standing_scheme_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "name": row.get::<_, String>(1)?,
                }))
            },
        )?,
    );
    insert_family(
        target,
        "standingTables",
        query_json_rows(
            connection,
            "SELECT t.competition_standing_table_id, t.competition_standing_scheme_id, t.scope_structure_node_id, t.name FROM competition_standing_table t JOIN competition_standing_scheme s ON s.competition_standing_scheme_id = t.competition_standing_scheme_id WHERE s.competition_season_id = ?1 ORDER BY t.competition_standing_scheme_id, t.competition_standing_table_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "schemeId": row.get::<_, String>(1)?,
                    "scopeStructureNodeId": row.get::<_, Option<String>>(2)?,
                    "name": row.get::<_, Option<String>>(3)?,
                }))
            },
        )?,
    );
    insert_family(
        target,
        "standingMetricDefinitions",
        query_json_rows(
            connection,
            "SELECT d.competition_standing_metric_definition_id, d.competition_standing_scheme_id, d.metric_code, d.operation, d.source_scope FROM competition_standing_metric_definition d JOIN competition_standing_scheme s ON s.competition_standing_scheme_id = d.competition_standing_scheme_id WHERE s.competition_season_id = ?1 ORDER BY d.competition_standing_scheme_id, d.metric_code, d.competition_standing_metric_definition_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "schemeId": row.get::<_, String>(1)?,
                    "metricCode": row.get::<_, String>(2)?,
                    "operation": row.get::<_, String>(3)?,
                    "sourceScope": row.get::<_, String>(4)?,
                }))
            },
        )?,
    );
    insert_family(
        target,
        "standingPointsRules",
        query_json_rows(
            connection,
            "SELECT r.competition_standing_points_rule_id, r.competition_standing_scheme_id, r.rule_type, r.priority, r.rule_payload_json FROM competition_standing_points_rule r JOIN competition_standing_scheme s ON s.competition_standing_scheme_id = r.competition_standing_scheme_id WHERE s.competition_season_id = ?1 ORDER BY r.competition_standing_scheme_id, r.priority, r.competition_standing_points_rule_id",
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
        target,
        "standingResultTreatmentRules",
        query_json_rows(
            connection,
            "SELECT r.competition_standing_result_treatment_rule_id, r.competition_standing_scheme_id, r.rule_type, r.priority, r.rule_payload_json FROM competition_standing_result_treatment_rule r JOIN competition_standing_scheme s ON s.competition_standing_scheme_id = r.competition_standing_scheme_id WHERE s.competition_season_id = ?1 ORDER BY r.competition_standing_scheme_id, r.priority, r.competition_standing_result_treatment_rule_id",
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
        target,
        "standingNormalizationRules",
        query_json_rows(
            connection,
            "SELECT r.competition_standing_normalization_rule_id, r.competition_standing_scheme_id, r.rule_type, r.priority, r.rule_payload_json FROM competition_standing_normalization_rule r JOIN competition_standing_scheme s ON s.competition_standing_scheme_id = r.competition_standing_scheme_id WHERE s.competition_season_id = ?1 ORDER BY r.competition_standing_scheme_id, r.priority, r.competition_standing_normalization_rule_id",
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
        target,
        "tiebreakerRulesets",
        query_json_rows(
            connection,
            "SELECT r.competition_tiebreaker_ruleset_id, r.competition_standing_scheme_id, r.name FROM competition_tiebreaker_ruleset r JOIN competition_standing_scheme s ON s.competition_standing_scheme_id = r.competition_standing_scheme_id WHERE s.competition_season_id = ?1 ORDER BY r.competition_standing_scheme_id, r.competition_tiebreaker_ruleset_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "schemeId": row.get::<_, String>(1)?,
                    "name": row.get::<_, Option<String>>(2)?,
                }))
            },
        )?,
    );
    insert_family(
        target,
        "tiebreakerRules",
        query_json_rows(
            connection,
            "SELECT r.competition_tiebreaker_rule_id, r.competition_tiebreaker_ruleset_id, r.sequence_no, r.criterion, r.unavailable_data_action FROM competition_tiebreaker_rule r JOIN competition_tiebreaker_ruleset rs ON rs.competition_tiebreaker_ruleset_id = r.competition_tiebreaker_ruleset_id JOIN competition_standing_scheme s ON s.competition_standing_scheme_id = rs.competition_standing_scheme_id WHERE s.competition_season_id = ?1 ORDER BY r.competition_tiebreaker_ruleset_id, r.sequence_no, r.competition_tiebreaker_rule_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "rulesetId": row.get::<_, String>(1)?,
                    "sequenceNo": row.get::<_, i64>(2)?,
                    "criterion": row.get::<_, String>(3)?,
                    "unavailableDataAction": row.get::<_, Option<String>>(4)?,
                }))
            },
        )?,
    );
    insert_family(
        target,
        "tiebreakerConditions",
        query_json_rows(
            connection,
            "SELECT c.competition_tiebreaker_condition_id, c.competition_tiebreaker_rule_id, c.type, c.payload_json FROM competition_tiebreaker_condition c JOIN competition_tiebreaker_rule r ON r.competition_tiebreaker_rule_id = c.competition_tiebreaker_rule_id JOIN competition_tiebreaker_ruleset rs ON rs.competition_tiebreaker_ruleset_id = r.competition_tiebreaker_ruleset_id JOIN competition_standing_scheme s ON s.competition_standing_scheme_id = rs.competition_standing_scheme_id WHERE s.competition_season_id = ?1 ORDER BY r.competition_tiebreaker_ruleset_id, r.sequence_no, c.competition_tiebreaker_condition_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "ruleId": row.get::<_, String>(1)?,
                    "type": row.get::<_, String>(2)?,
                    "payload": parse_optional_json(row.get::<_, Option<String>>(3)?)?,
                }))
            },
        )?,
    );
    insert_family(
        target,
        "tiebreakerActions",
        query_json_rows(
            connection,
            "SELECT a.competition_tiebreaker_action_id, a.competition_tiebreaker_rule_id, a.type, a.payload_json FROM competition_tiebreaker_action a JOIN competition_tiebreaker_rule r ON r.competition_tiebreaker_rule_id = a.competition_tiebreaker_rule_id JOIN competition_tiebreaker_ruleset rs ON rs.competition_tiebreaker_ruleset_id = r.competition_tiebreaker_ruleset_id JOIN competition_standing_scheme s ON s.competition_standing_scheme_id = rs.competition_standing_scheme_id WHERE s.competition_season_id = ?1 ORDER BY r.competition_tiebreaker_ruleset_id, r.sequence_no, a.competition_tiebreaker_action_id",
            competition_season_id,
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "ruleId": row.get::<_, String>(1)?,
                    "type": row.get::<_, String>(2)?,
                    "payload": parse_optional_json(row.get::<_, Option<String>>(3)?)?,
                }))
            },
        )?,
    );

    Ok(())
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
        .map_err(|error| format!("Unable to prepare World DB standings query: {error}"))?;
    let rows = statement
        .query_map([competition_season_id], |row| map(row))
        .map_err(|error| format!("Unable to query World DB standings: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB standings row: {error}"))
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
