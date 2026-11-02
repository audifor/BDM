//! Read-only projection of the existing DB-03/04 PBM catalogs.
//!
//! This is deliberately separate from `WorldDatabaseRepository`: DB-04 is not a
//! DDL-PHASE1-A runtime database and this adapter does not claim to bootstrap a game.

use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSourceV1 {
    pub database_file: String,
    pub catalog_layers: [&'static str; 2],
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CountryV1 {
    pub country_key: String,
    pub source_id: i64,
    pub name: String,
    pub source_code: String,
    pub continent_id: i64,
    pub provenance: String,
    pub confidence: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompetitionSummaryV1 {
    pub db03_competition_key: String,
    pub source_key: String,
    pub source_native_id: String,
    pub certified_competition_id: Option<String>,
    pub display_name: Option<String>,
    pub native_name_raw: Option<String>,
    pub country_key: Option<String>,
    pub country_code: Option<String>,
    pub source_system: String,
    pub gender_raw: Option<String>,
    pub gender_normalized: Option<String>,
    pub age_category_raw: Option<String>,
    pub level_raw: Option<String>,
    pub division_raw: Option<String>,
    pub identity_status: String,
    pub identity_confidence: Option<String>,
    pub identity_provenance: Option<String>,
    pub source_provenance: String,
    pub format_status: String,
    pub certification_scope: Option<String>,
    pub availability: String,
    pub game_executable: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamV1 {
    pub source_team_key: String,
    pub source_team_id: i64,
    pub source_table: String,
    pub entity_class: String,
    pub canonical_team_id: Option<String>,
    pub display_name: Option<String>,
    pub official_edition_team_names: Vec<String>,
    pub source_provenance: String,
    pub country_key: Option<String>,
    pub relation_status: String,
    pub source_link_keys: Vec<String>,
    pub competition_link_evidence: Vec<Value>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditionV1 {
    pub edition_id: String,
    pub competition_id: String,
    pub season_label: String,
    pub edition_status: String,
    pub source_status: String,
    pub participant_count: usize,
    pub format_version: Option<String>,
    pub format_status: String,
    pub certification_scope: Option<String>,
    pub participants: Vec<EditionParticipantV1>,
    pub format_document: Option<Value>,
    pub stages: Vec<Value>,
    pub transitions: Vec<Value>,
    pub sources: Vec<Value>,
    pub source_rules: Vec<Value>,
    pub format_sha256: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditionParticipantV1 {
    pub participant_key: String,
    pub source_team_key: String,
    pub source_team_id: i64,
    pub source_competition_id: String,
    pub canonical_team_id: String,
    pub official_team_name: String,
    pub official_membership_id: String,
    pub provenance: String,
    pub confidence: String,
    pub status: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompetitionDetailV1 {
    pub schema_version: u8,
    pub source: CatalogSourceV1,
    pub competition: CompetitionSummaryV1,
    pub teams: Vec<TeamV1>,
    pub editions: Vec<EditionV1>,
    pub legacy_phases: Vec<Value>,
    pub groups: Vec<Value>,
    pub qualification_relations: Vec<Value>,
    pub relegation_relations: Vec<Value>,
    pub missing_references: Vec<Value>,
    pub total_unresolved_inherited_relation_findings: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CountriesResponseV1 {
    pub schema_version: u8,
    pub source: CatalogSourceV1,
    pub countries: Vec<CountryV1>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompetitionsResponseV1 {
    pub schema_version: u8,
    pub source: CatalogSourceV1,
    pub competitions: Vec<CompetitionSummaryV1>,
}

fn open_read_only(database_path: &Path) -> Result<Connection, String> {
    if !database_path.is_file() {
        return Err(format!(
            "WorldDB file does not exist: {}",
            database_path.display()
        ));
    }
    let connection = Connection::open_with_flags(database_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("Unable to open WorldDB read-only: {error}"))?;
    connection
        .execute_batch("PRAGMA query_only = ON; PRAGMA foreign_keys = ON;")
        .map_err(|error| format!("Unable to enable read-only query mode: {error}"))?;
    let required = [
        "db03_country",
        "db03_competition",
        "db03_team",
        "db03_team_competition_link",
        "db03_phase",
        "db03_group",
        "db03_qualification_rule",
        "db03_relegation_rule",
        "db04_competition_identity",
        "db04_competition_edition",
        "db04_edition_participant",
        "db04_competition_format",
        "db04_source",
        "db04_format_rule",
        "db04_inherited_relation_review",
    ];
    for table in required {
        let exists = connection
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1",
                [table],
                |_| Ok(true),
            )
            .optional()
            .map_err(|error| format!("Unable to inspect WorldDB catalog: {error}"))?
            .unwrap_or(false);
        if !exists {
            return Err(format!("DB-03/04 catalog table is missing: {table}"));
        }
    }
    Ok(connection)
}

fn source(database_path: &Path) -> CatalogSourceV1 {
    CatalogSourceV1 {
        database_file: database_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("worlddb.db")
            .to_owned(),
        catalog_layers: ["DB-03", "DB-04"],
    }
}

pub fn list_countries_v1(database_path: &Path) -> Result<CountriesResponseV1, String> {
    let connection = open_read_only(database_path)?;
    let mut statement = connection
        .prepare("SELECT country_key, source_id, source_name, source_code, continent_id, provenance, confidence FROM db03_country ORDER BY source_code, country_key")
        .map_err(|error| format!("Unable to prepare country catalog query: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(CountryV1 {
                country_key: row.get(0)?,
                source_id: row.get(1)?,
                name: row.get(2)?,
                source_code: row.get(3)?,
                continent_id: row.get(4)?,
                provenance: row.get(5)?,
                confidence: row.get(6)?,
            })
        })
        .map_err(|error| format!("Unable to query countries: {error}"))?;
    let countries = rows
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode country record: {error}"))?;
    Ok(CountriesResponseV1 {
        schema_version: 1,
        source: source(database_path),
        countries,
    })
}

pub fn list_competitions_v1(
    database_path: &Path,
    country_code: Option<&str>,
) -> Result<CompetitionsResponseV1, String> {
    let connection = open_read_only(database_path)?;
    if let Some(code) = country_code {
        let count: i64 = connection
            .query_row(
                "SELECT count(*) FROM db03_country WHERE upper(source_code)=upper(?1)",
                [code],
                |row| row.get(0),
            )
            .map_err(|error| format!("Unable to verify country code: {error}"))?;
        if count == 0 {
            return Err(format!("Unknown PBM source country code: {code}"));
        }
        if count > 1 {
            return Err(format!("Ambiguous PBM source country code: {code}"));
        }
    }
    let summaries = read_competition_summaries(&connection, country_code)?;
    Ok(CompetitionsResponseV1 {
        schema_version: 1,
        source: source(database_path),
        competitions: summaries,
    })
}

pub fn read_competition_v1(
    database_path: &Path,
    selector: &str,
) -> Result<CompetitionDetailV1, String> {
    if selector.trim().is_empty() {
        return Err("competition selector must be non-empty".to_owned());
    }
    let connection = open_read_only(database_path)?;
    let summary = resolve_competition(&connection, selector)?;
    let mut teams = read_teams(&connection, &summary.db03_competition_key)?;
    let editions = read_editions(&connection, summary.certified_competition_id.as_deref())?;
    enrich_teams_from_certified_editions(&mut teams, &editions)?;
    let legacy_phases = read_raw_rows(
        &connection,
        "SELECT phase_key, source_phase_id, source_competition_id, competition_link_status, is_active, group_count_raw, first_group_raw, phase_source_json FROM db03_phase WHERE canonical_competition_id=?1 ORDER BY source_phase_id, phase_key",
        &summary.db03_competition_key,
        "phase_source_json",
    )?;
    let groups = read_raw_rows(
        &connection,
        "SELECT group_key, source_competition_id, canonical_competition_id, conference_raw, division_raw, group_identity_status, provenance, source_record_json FROM db03_group WHERE canonical_competition_id=?1 ORDER BY group_key",
        &summary.db03_competition_key,
        "source_record_json",
    )?;
    let qualification_relations = read_qualification_relations(&connection, &summary)?;
    let relegation_relations = read_relegation_relations(&connection, &summary)?;
    let missing_references =
        collect_missing_references(&connection, &qualification_relations, &relegation_relations)?;
    let total_unresolved_inherited_relation_findings = connection
        .query_row(
            "SELECT count(*) FROM db04_inherited_relation_review",
            [],
            |row| row.get::<_, usize>(0),
        )
        .map_err(|error| format!("Unable to count inherited findings: {error}"))?;

    Ok(CompetitionDetailV1 {
        schema_version: 1,
        source: source(database_path),
        competition: summary,
        teams,
        editions,
        legacy_phases,
        groups,
        qualification_relations,
        relegation_relations,
        missing_references,
        total_unresolved_inherited_relation_findings,
    })
}

fn read_competition_summaries(
    connection: &Connection,
    country_code: Option<&str>,
) -> Result<Vec<CompetitionSummaryV1>, String> {
    let sql = "SELECT c.canonical_id, c.source_key, c.source_id, c.source_system, c.source_country_code, c.country_key, c.gender_raw, c.gender_normalized, c.age_category_raw, c.level_raw, c.division_raw, c.format_status, c.identity_status, c.source_provenance, c.source_record_json, i.competition_id, i.display_name, i.identity_status, i.confidence, i.provenance, f.certification_status, f.certification_scope FROM db03_competition c LEFT JOIN db04_competition_identity i ON i.source_native_competition_id=c.canonical_id LEFT JOIN (SELECT e.competition_id, max(cf.certification_status) AS certification_status, max(cf.certification_scope) AS certification_scope FROM db04_competition_edition e JOIN db04_competition_format cf ON cf.edition_id=e.edition_id GROUP BY e.competition_id) f ON f.competition_id=i.competition_id WHERE c.source_system='PBM' AND (?1 IS NULL OR upper(c.source_country_code)=upper(?1)) ORDER BY c.source_country_code, c.canonical_id";
    let mut statement = connection
        .prepare(sql)
        .map_err(|error| format!("Unable to prepare competition catalog query: {error}"))?;
    let rows = statement
        .query_map([country_code], map_competition_summary)
        .map_err(|error| format!("Unable to query competitions: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode competition record: {error}"))
}

fn map_competition_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<CompetitionSummaryV1> {
    let raw: String = row.get(14)?;
    let raw_value: Value = parse_json_from_row(raw, 14)?;
    let db03_key: String = row.get(0)?;
    let identity_id: Option<String> = row.get(15)?;
    let identity_status: Option<String> = row.get(17)?;
    let format_certification: Option<String> = row.get(20)?;
    let is_certified_data = identity_status.as_deref() == Some("CERTIFIED")
        && format_certification.as_deref() == Some("CERTIFIED");
    let format_status: String = row.get::<_, Option<String>>(20)?.unwrap_or(row.get(11)?);
    Ok(CompetitionSummaryV1 {
        db03_competition_key: db03_key.clone(),
        source_key: row.get(1)?,
        source_native_id: row.get(2)?,
        certified_competition_id: identity_id,
        display_name: row.get(16)?,
        native_name_raw: first_text(
            &raw_value,
            &[
                "nom_championnat_original",
                "nom_championnat",
                "nom_ligue",
                "nom_competition",
            ],
        ),
        country_key: row.get(5)?,
        country_code: row.get(4)?,
        source_system: row.get(3)?,
        gender_raw: row.get(6)?,
        gender_normalized: row.get(7)?,
        age_category_raw: row.get(8)?,
        level_raw: row.get(9)?,
        division_raw: row.get(10)?,
        identity_status: identity_status.unwrap_or(row.get(12)?),
        identity_confidence: row.get(18)?,
        identity_provenance: row.get(19)?,
        source_provenance: row.get(13)?,
        format_status,
        certification_scope: row.get(21)?,
        availability: if is_certified_data {
            "CERTIFIED_DATA_ONLY"
        } else {
            "SOURCE_ONLY_UNVERIFIED"
        }
        .to_owned(),
        game_executable: false,
    })
}

fn resolve_competition(
    connection: &Connection,
    selector: &str,
) -> Result<CompetitionSummaryV1, String> {
    let native_id: Option<String> = connection
        .query_row(
            "SELECT source_native_competition_id FROM db04_competition_identity WHERE competition_id=?1",
            [selector],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("Unable to resolve certified competition identity: {error}"))?;
    let resolved = native_id.as_deref().unwrap_or(selector);
    let mut matches = read_competition_summaries(connection, None)?
        .into_iter()
        .filter(|item| item.db03_competition_key == resolved || item.source_key == selector)
        .collect::<Vec<_>>();
    match matches.len() {
        0 => Err(format!(
            "Competition not found in DB-03/04 catalog: {selector}"
        )),
        1 => Ok(matches.remove(0)),
        count => Err(format!(
            "Ambiguous competition selector {selector}; {count} records match"
        )),
    }
}

fn read_teams(connection: &Connection, competition_key: &str) -> Result<Vec<TeamV1>, String> {
    let mut statement = connection
        .prepare("SELECT l.link_key, l.team_key, l.relation_status, l.link_kind, l.source_row_id, l.source_record_json, t.source_id, t.source_table, t.entity_class, t.name_decoded, t.country_key, t.provenance FROM db03_team_competition_link l LEFT JOIN db03_team t ON t.team_key=l.team_key WHERE l.canonical_competition_id=?1 ORDER BY l.team_key, l.link_key")
        .map_err(|error| format!("Unable to prepare competition team query: {error}"))?;
    let rows = statement
        .query_map([competition_key], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, Option<i64>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, Option<String>>(10)?,
                row.get::<_, Option<String>>(11)?,
            ))
        })
        .map_err(|error| format!("Unable to query competition team links: {error}"))?;
    let mut teams: BTreeMap<String, TeamV1> = BTreeMap::new();
    for item in rows {
        let (
            link_key,
            team_key,
            relation_status,
            link_kind,
            source_row_id,
            source_record_raw,
            source_id,
            source_table,
            entity_class,
            name,
            country_key,
            team_provenance,
        ) = item.map_err(|error| format!("Unable to decode competition team link: {error}"))?;
        let source_id = source_id.ok_or_else(|| {
            format!("Team link {link_key} has no matching source team {team_key}")
        })?;
        let source_table =
            source_table.ok_or_else(|| format!("Team link {link_key} has no source table"))?;
        let entity_class = entity_class
            .ok_or_else(|| format!("Team link {link_key} has no entity classification"))?;
        let team_provenance = team_provenance
            .ok_or_else(|| format!("Team link {link_key} has no source provenance"))?;
        let link_evidence = json!({
            "linkKey": link_key,
            "linkKind": link_kind,
            "sourceRowId": source_row_id,
            "relationStatus": relation_status,
            "sourceRecord": parse_json_from_row(source_record_raw, 5)
                .map_err(|error| format!("Unable to decode source evidence for team link {link_key}: {error}"))?
        });
        let entry = teams.entry(team_key.clone()).or_insert_with(|| TeamV1 {
            source_team_key: team_key,
            source_team_id: source_id,
            source_table,
            entity_class,
            canonical_team_id: None,
            display_name: name,
            official_edition_team_names: Vec::new(),
            source_provenance: team_provenance,
            country_key,
            relation_status: relation_status.clone(),
            source_link_keys: Vec::new(),
            competition_link_evidence: Vec::new(),
        });
        if !entry.source_link_keys.contains(&link_key) {
            entry.source_link_keys.push(link_key.clone());
        }
        entry.competition_link_evidence.push(link_evidence);
        if entry.relation_status != relation_status {
            entry.relation_status = "MIXED_LINK_STATUS".to_owned();
        }
    }
    Ok(teams.into_values().collect())
}

fn enrich_teams_from_certified_editions(
    teams: &mut [TeamV1],
    editions: &[EditionV1],
) -> Result<(), String> {
    let mut canonical_ids: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut official_names: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for participant in editions
        .iter()
        .flat_map(|edition| edition.participants.iter())
    {
        canonical_ids
            .entry(participant.source_team_key.clone())
            .or_default()
            .insert(participant.canonical_team_id.clone());
        official_names
            .entry(participant.source_team_key.clone())
            .or_default()
            .insert(participant.official_team_name.clone());
    }
    for source_team_key in canonical_ids.keys() {
        if !teams
            .iter()
            .any(|team| team.source_team_key == *source_team_key)
        {
            return Err(format!(
                "Certified edition participant references a missing PBM team: {source_team_key}"
            ));
        }
    }
    for team in teams {
        if let Some(ids) = canonical_ids.get(&team.source_team_key) {
            if ids.len() == 1 {
                team.canonical_team_id = ids.first().cloned();
            }
        }
        if let Some(names) = official_names.get(&team.source_team_key) {
            team.official_edition_team_names = names.iter().cloned().collect();
        }
    }
    Ok(())
}

fn read_editions(
    connection: &Connection,
    certified_competition_id: Option<&str>,
) -> Result<Vec<EditionV1>, String> {
    let Some(competition_id) = certified_competition_id else {
        return Ok(Vec::new());
    };
    let mut statement = connection
        .prepare("SELECT e.edition_id, e.competition_id, e.season_label, e.edition_status, e.source_status, e.participant_count, f.format_version, f.certification_status, f.certification_scope, f.format_json, f.format_sha256 FROM db04_competition_edition e LEFT JOIN db04_competition_format f ON f.edition_id=e.edition_id WHERE e.competition_id=?1 ORDER BY e.season_label, e.edition_id")
        .map_err(|error| format!("Unable to prepare edition query: {error}"))?;
    let rows = statement
        .query_map([competition_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, usize>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, Option<String>>(10)?,
            ))
        })
        .map_err(|error| format!("Unable to query editions: {error}"))?;
    let mut editions = Vec::new();
    for row in rows {
        let (
            edition_id,
            competition_id,
            season_label,
            edition_status,
            source_status,
            participant_count,
            format_version,
            format_status,
            certification_scope,
            format_text,
            format_sha256,
        ) = row.map_err(|error| format!("Unable to decode edition record: {error}"))?;
        let participants = read_participants(connection, &edition_id)?;
        let declares_certified =
            edition_status == "CERTIFIED" && format_status.as_deref() == Some("CERTIFIED");
        if declares_certified && participants.len() != participant_count {
            return Err(format!(
                "Certified DB-04 edition {edition_id} declares {participant_count} participants but contains {}",
                participants.len()
            ));
        }
        if declares_certified && format_text.is_none() {
            return Err(format!(
                "Certified DB-04 edition {edition_id} has no format document"
            ));
        }
        let certified = declares_certified;
        let format_document = if certified {
            format_text
                .as_deref()
                .map(|text| parse_json(text, &format!("format for edition {edition_id}")))
                .transpose()?
        } else {
            None
        };
        let (stages, transitions) = extract_format_graph(format_document.as_ref());
        let sources = read_edition_sources(connection, format_document.as_ref())?;
        let source_rules = read_edition_rules(connection, &edition_id)?;
        editions.push(EditionV1 {
            edition_id,
            competition_id,
            season_label,
            edition_status,
            source_status,
            participant_count,
            format_version,
            format_status: format_status.unwrap_or_else(|| "NO_CERTIFIED_FORMAT".to_owned()),
            certification_scope,
            participants,
            format_document,
            stages,
            transitions,
            sources,
            source_rules,
            format_sha256,
        });
    }
    Ok(editions)
}

fn read_participants(
    connection: &Connection,
    edition_id: &str,
) -> Result<Vec<EditionParticipantV1>, String> {
    let mut statement = connection
        .prepare("SELECT participant_key, source_team_key, source_team_id, source_competition_id, canonical_team_id, official_edition_team_name, official_membership_id, provenance, confidence, status FROM db04_edition_participant WHERE edition_id=?1 ORDER BY source_team_id, participant_key")
        .map_err(|error| format!("Unable to prepare edition participant query: {error}"))?;
    let rows = statement
        .query_map([edition_id], |row| {
            Ok(EditionParticipantV1 {
                participant_key: row.get(0)?,
                source_team_key: row.get(1)?,
                source_team_id: row.get(2)?,
                source_competition_id: row.get(3)?,
                canonical_team_id: row.get(4)?,
                official_team_name: row.get(5)?,
                official_membership_id: row.get(6)?,
                provenance: row.get(7)?,
                confidence: row.get(8)?,
                status: row.get(9)?,
            })
        })
        .map_err(|error| format!("Unable to query edition participants: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode edition participant: {error}"))
}

fn extract_format_graph(document: Option<&Value>) -> (Vec<Value>, Vec<Value>) {
    let Some(document) = document else {
        return (Vec::new(), Vec::new());
    };
    let mut stages = Vec::new();
    let mut transitions = Vec::new();
    if let Some(variants) = document.get("variants").and_then(Value::as_array) {
        for variant in variants {
            let variant_key = variant.get("key").cloned().unwrap_or(Value::Null);
            if let Some(nodes) = variant.get("nodes").and_then(Value::as_array) {
                for node in nodes {
                    stages.push(json!({ "variantKey": variant_key, "stage": node }));
                }
            }
            if let Some(edges) = variant.get("edges").and_then(Value::as_array) {
                for edge in edges {
                    transitions.push(json!({ "variantKey": variant_key, "transition": edge }));
                }
            }
        }
    }
    (stages, transitions)
}

fn read_edition_sources(
    connection: &Connection,
    format_document: Option<&Value>,
) -> Result<Vec<Value>, String> {
    let source_ids: BTreeSet<String> = format_document
        .and_then(|document| document.get("sources"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|source| source.get("url").and_then(Value::as_str).map(str::to_owned))
        .collect();
    let mut output = Vec::new();
    for url in source_ids {
        let row = connection
            .query_row(
                "SELECT source_id, url, organization, edition, source_type, retrieved_or_recorded_at, scope, content_sha256 FROM db04_source WHERE url=?1 ORDER BY source_id LIMIT 1",
                [&url],
                |row| Ok(json!({
                    "sourceId": row.get::<_, String>(0)?, "url": row.get::<_, String>(1)?,
                    "organization": row.get::<_, String>(2)?, "edition": row.get::<_, String>(3)?,
                    "sourceType": row.get::<_, String>(4)?, "recordedAt": row.get::<_, String>(5)?,
                    "scope": row.get::<_, String>(6)?, "contentSha256": row.get::<_, Option<String>>(7)?
                })),
            )
            .optional()
            .map_err(|error| format!("Unable to query certified source {url}: {error}"))?;
        output.push(row.unwrap_or_else(
            || json!({ "url": url, "sourceStatus": "NOT_IN_DB04_SOURCE_CATALOG" }),
        ));
    }
    Ok(output)
}

fn read_edition_rules(connection: &Connection, edition_id: &str) -> Result<Vec<Value>, String> {
    let mut statement = connection
        .prepare("SELECT rule_key, rule_kind, rule_json, source_id, confidence, status FROM db04_format_rule WHERE edition_id=?1 ORDER BY rule_kind, rule_key")
        .map_err(|error| format!("Unable to prepare edition source-rule query: {error}"))?;
    let rows = statement
        .query_map([edition_id], |row| {
            let raw: String = row.get(2)?;
            let parsed = parse_json_from_row(raw, 2)?;
            Ok(json!({
                "ruleKey": row.get::<_, String>(0)?, "ruleKind": row.get::<_, String>(1)?,
                "rule": parsed, "sourceId": row.get::<_, String>(3)?,
                "confidence": row.get::<_, String>(4)?, "status": row.get::<_, String>(5)?
            }))
        })
        .map_err(|error| format!("Unable to query edition source rules: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode edition source rule: {error}"))
}

fn read_raw_rows(
    connection: &Connection,
    sql: &str,
    parameter: &str,
    json_column: &str,
) -> Result<Vec<Value>, String> {
    let mut statement = connection
        .prepare(sql)
        .map_err(|error| format!("Unable to prepare PBM relation query: {error}"))?;
    let column_count = statement.column_count();
    let json_index = (0..column_count)
        .find(|index| statement.column_name(*index).ok() == Some(json_column))
        .ok_or_else(|| format!("Expected JSON column {json_column} is absent"))?;
    let rows = statement
        .query_map([parameter], |row| {
            let mut object = serde_json::Map::new();
            for index in 0..column_count {
                let name = row
                    .as_ref()
                    .column_name(index)
                    .unwrap_or("column")
                    .to_owned();
                if index as usize == json_index {
                    let raw: String = row.get(index)?;
                    object.insert(name, parse_json_from_row(raw, index)?);
                } else {
                    let value = match row.get_ref(index)? {
                        rusqlite::types::ValueRef::Null => Value::Null,
                        rusqlite::types::ValueRef::Integer(value) => json!(value),
                        rusqlite::types::ValueRef::Real(value) => json!(value),
                        rusqlite::types::ValueRef::Text(value) => {
                            json!(String::from_utf8_lossy(value))
                        }
                        rusqlite::types::ValueRef::Blob(value) => json!(value),
                    };
                    object.insert(name, value);
                }
            }
            Ok(Value::Object(object))
        })
        .map_err(|error| format!("Unable to query PBM relations: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode PBM relation: {error}"))
}

fn read_qualification_relations(
    connection: &Connection,
    competition: &CompetitionSummaryV1,
) -> Result<Vec<Value>, String> {
    let source_id = competition.source_native_id.parse::<i64>().ok();
    let mut statement = connection
        .prepare("SELECT source_row_id, source_target_phase_id, target_phase_key, source_origin_competition_id, origin_competition_id, relation_status, source_record_json FROM db03_qualification_rule WHERE origin_competition_id=?1 OR (?2 IS NOT NULL AND source_origin_competition_id=?2) ORDER BY source_row_id")
        .map_err(|error| format!("Unable to prepare qualification relation query: {error}"))?;
    let rows = statement
        .query_map(rusqlite::params![competition.db03_competition_key, source_id], |row| {
            let raw: String = row.get(6)?;
            let source_record = parse_json_from_row(raw, 6)?;
            let phase_origin = source_record.get("phase_origine").and_then(Value::as_i64);
            Ok(json!({
                "sourceRowId": row.get::<_, i64>(0)?, "sourceTargetPhaseId": row.get::<_, i64>(1)?,
                "targetPhaseKey": row.get::<_, Option<String>>(2)?, "sourceOriginCompetitionId": row.get::<_, i64>(3)?,
                "originCompetitionId": row.get::<_, String>(4)?, "relationStatus": row.get::<_, String>(5)?,
                "sourceOriginPhaseId": phase_origin, "sourceRecord": source_record
            }))
        })
        .map_err(|error| format!("Unable to query qualification relations: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode qualification relation: {error}"))
}

fn read_relegation_relations(
    connection: &Connection,
    competition: &CompetitionSummaryV1,
) -> Result<Vec<Value>, String> {
    let source_id = competition.source_native_id.parse::<i64>().ok();
    let mut statement = connection
        .prepare("SELECT source_row_id, source_competition_id, competition_id, source_future_competition_id, future_competition_id, relation_status, source_record_json FROM db03_relegation_rule WHERE competition_id=?1 OR future_competition_id=?1 OR (?2 IS NOT NULL AND (source_competition_id=?2 OR source_future_competition_id=?2)) ORDER BY source_row_id")
        .map_err(|error| format!("Unable to prepare relegation relation query: {error}"))?;
    let rows = statement
        .query_map(rusqlite::params![competition.db03_competition_key, source_id], |row| {
            let raw: String = row.get(6)?;
            let source_record = parse_json_from_row(raw, 6)?;
            Ok(json!({
                "sourceRowId": row.get::<_, i64>(0)?, "sourceCompetitionId": row.get::<_, i64>(1)?,
                "competitionId": row.get::<_, String>(2)?, "sourceFutureCompetitionId": row.get::<_, i64>(3)?,
                "futureCompetitionId": row.get::<_, Option<String>>(4)?, "relationStatus": row.get::<_, String>(5)?,
                "sourceRecord": source_record
            }))
        })
        .map_err(|error| format!("Unable to query relegation relations: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode relegation relation: {error}"))
}

fn collect_missing_references(
    connection: &Connection,
    qualification: &[Value],
    relegation: &[Value],
) -> Result<Vec<Value>, String> {
    let mut missing: BTreeMap<String, Value> = BTreeMap::new();
    for row in qualification {
        let phase_id = row
            .get("sourceOriginPhaseId")
            .and_then(Value::as_i64)
            .unwrap_or(0);
        if phase_id <= 0 {
            continue;
        }
        let phase_record = connection
            .query_row(
                "SELECT canonical_competition_id, competition_link_status FROM db03_phase WHERE source_phase_id=?1",
                [phase_id],
                |result| Ok((result.get::<_, Option<String>>(0)?, result.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(|error| format!("Unable to check referenced phase {phase_id}: {error}"))?;
        let phase_is_resolved =
            phase_record
                .as_ref()
                .is_some_and(|(competition_id, link_status)| {
                    competition_id.is_some() && link_status == "SOURCE_ID_UNIQUE"
                });
        if !phase_is_resolved {
            let row_id = row
                .get("sourceRowId")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            let item = missing
                .entry(format!("phase:{phase_id}"))
                .or_insert_with(|| {
                    json!({
                        "referenceType": "PHASE", "missingSourceId": phase_id,
                        "status": if phase_record.is_none() { "MISSING_PBM_REFERENCE" } else { "UNRESOLVED_PBM_PARENT_IDENTITY" },
                        "phaseRecordExists": phase_record.is_some(),
                        "phaseLinkStatus": phase_record.as_ref().map(|(_, status)| status.as_str()),
                        "relatedQualificationRowIds": [],
                        "evidenceFindingKey": format!("STA_competition_phase:{phase_id}")
                    })
                });
            item["relatedQualificationRowIds"]
                .as_array_mut()
                .expect("array initialized")
                .push(json!(row_id));
        }
    }
    for relation in relegation {
        let source_record = relation.get("sourceRecord").unwrap_or(&Value::Null);
        for key in ["competition_id", "future_competition_id"] {
            let referenced = source_record.get(key).and_then(Value::as_i64).unwrap_or(0);
            if referenced <= 0 {
                continue;
            }
            let candidate_count: i64 = connection
                .query_row(
                    "SELECT count(DISTINCT canonical_id) FROM db03_competition WHERE source_system='PBM' AND source_id=?1",
                    [referenced.to_string()],
                    |row| row.get(0),
                )
                .map_err(|error| format!("Unable to check referenced competition {referenced}: {error}"))?;
            if candidate_count != 1 {
                let row_id = relation
                    .get("sourceRowId")
                    .and_then(Value::as_i64)
                    .unwrap_or_default();
                let key = format!("competition:{referenced}");
                let item = missing.entry(key).or_insert_with(|| {
                    json!({
                        "referenceType": "COMPETITION", "missingSourceId": referenced,
                        "status": if candidate_count == 0 { "MISSING_PBM_REFERENCE" } else { "AMBIGUOUS_PBM_REFERENCE" },
                        "candidateCount": candidate_count, "relatedRelationRowIds": []
                    })
                });
                item["relatedRelationRowIds"]
                    .as_array_mut()
                    .expect("array initialized")
                    .push(json!(row_id));
            }
        }
    }
    for item in missing.values_mut() {
        let phase_id = item.get("missingSourceId").and_then(Value::as_i64);
        if let Some(phase_id) = phase_id.filter(|_| item["referenceType"] == "PHASE") {
            let finding = connection
                .query_row(
                    "SELECT finding_key, functional_impact, db03_status, evidence_json FROM db03_graph_finding WHERE child_table='STA_competition_phase' AND child_row_id=?1",
                    [phase_id.to_string()],
                    |row| {
                        let evidence: String = row.get(3)?;
                        Ok(json!({
                            "findingKey": row.get::<_, String>(0)?, "functionalImpact": row.get::<_, String>(1)?,
                        "status": row.get::<_, String>(2)?, "evidence": parse_json_from_row(evidence, 3)?
                        }))
                    },
                )
                .optional()
                .map_err(|error| format!("Unable to read phase finding {phase_id}: {error}"))?;
            item["sourceFinding"] = finding.unwrap_or(Value::Null);
            item["recoveryReview"] = connection
                .query_row(
                    "SELECT disposition, recovery_note, migration_version FROM db04_inherited_relation_review WHERE finding_key=?1",
                    [format!("STA_competition_phase:{phase_id}")],
                    |row| Ok(json!({
                        "disposition": row.get::<_, String>(0)?,
                        "recoveryNote": row.get::<_, String>(1)?,
                        "migrationVersion": row.get::<_, String>(2)?
                    })),
                )
                .optional()
                .map_err(|error| format!("Unable to read recovery review for phase {phase_id}: {error}"))?
                .unwrap_or(Value::Null);
        }
    }
    Ok(missing.into_values().collect())
}

fn parse_json(text: &str, label: &str) -> Result<Value, String> {
    serde_json::from_str(text).map_err(|error| format!("Invalid JSON in {label}: {error}"))
}

fn parse_json_from_row(raw: String, column_index: usize) -> rusqlite::Result<Value> {
    serde_json::from_str(&raw).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            column_index,
            rusqlite::types::Type::Text,
            Box::new(error),
        )
    })
}

fn first_text(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str).map(str::to_owned))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_db04_catalog_when_integration_path_is_provided() {
        let Some(path) = std::env::var_os("DB06_WORLDDB_PATH") else {
            eprintln!("skipped live DB-04 integration assertions: DB06_WORLDDB_PATH is unset");
            return;
        };
        let path = std::path::PathBuf::from(path);
        let countries = list_countries_v1(&path).unwrap();
        assert_eq!(countries.countries.len(), 210);
        assert_eq!(
            countries
                .countries
                .iter()
                .filter(|country| country.source_code == "ESP")
                .count(),
            1
        );
        let competitions = list_competitions_v1(&path, Some("ESP")).unwrap();
        assert_eq!(competitions.competitions.len(), 6);
        let detail = read_competition_v1(&path, "competition:ESP:liga-endesa").unwrap();
        assert_eq!(detail.teams.len(), 18);
        assert_eq!(detail.editions.len(), 1);
        assert_eq!(detail.editions[0].participants.len(), 18);
        assert_eq!(detail.editions[0].stages.len(), 4);
        assert_eq!(detail.editions[0].transitions.len(), 3);
        assert!(detail
            .missing_references
            .iter()
            .any(|item| item["missingSourceId"] == 255));
        assert!(detail
            .qualification_relations
            .iter()
            .any(|item| item["sourceOriginPhaseId"] == 255));
        let other = read_competition_v1(&path, "PBM:NATIONAL:112").unwrap();
        assert_eq!(other.competition.availability, "SOURCE_ONLY_UNVERIFIED");
        assert!(other.editions.is_empty());
        let connection = open_read_only(&path).unwrap();
        assert!(connection.execute("INSERT INTO db04_source(source_id,url,organization,edition,source_type,retrieved_or_recorded_at,scope) VALUES('db06-test-write','x','x','x','x','x','x')", []).is_err());
    }
}
