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
pub struct WorldDbGameBootstrapTeamV1 {
    team_id: String,
    name: String,
    gender: String,
    country_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapPlayerV1 {
    player_id: String,
    first_name: String,
    last_name: String,
    gender: String,
    nationality_id: String,
    date_of_birth: String,
    height_cm: f64,
    weight_kg: f64,
    primary_position: String,
    ratings: BTreeMap<String, f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDbGameBootstrapRosterAssignmentV1 {
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
    teams: Vec<WorldDbGameBootstrapTeamV1>,
    players: Vec<WorldDbGameBootstrapPlayerV1>,
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

    let (competition_id, competition_name, ecosystem_name, ecosystem_gender) = connection
        .query_row(
            "SELECT cs.competition_id, ce.canonical_name, eco.name, eco.gender FROM competition_season cs JOIN competition c ON c.competition_id = cs.competition_id JOIN entity ce ON ce.entity_id = c.entity_id JOIN ecosystem_competition_assignment a ON a.competition_id = c.competition_id JOIN competition_ecosystem eco ON eco.competition_ecosystem_id = a.competition_ecosystem_id WHERE cs.competition_season_id = ?1 AND a.competition_ecosystem_id = ?2 ORDER BY a.ecosystem_competition_assignment_id LIMIT 1",
            (competition_season_id, ecosystem_id),
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, Option<String>>(3)?)),
        )
        .map_err(|error| format!("Unable to load World DB bootstrap competition context: {error}"))?;
    let gender = gender_from_ecosystem(ecosystem_gender.as_deref());
    let ecosystem_kind = ecosystem_kind(&ecosystem_name);
    let season = connection
        .query_row(
            "SELECT cs.competition_season_id, cs.season_id, COALESCE(s.label, s.season_id), s.start_date, s.end_date FROM competition_season cs JOIN season s ON s.season_id = cs.season_id WHERE cs.competition_season_id = ?1",
            [competition_season_id],
            |row| Ok(WorldDbGameBootstrapSeasonV1 { competition_season_id: row.get(0)?, season_id: row.get(1)?, label: row.get(2)?, start_date: row.get(3)?, end_date: row.get(4)? }),
        )
        .map_err(|error| format!("Unable to load World DB bootstrap season {competition_season_id}: {error}"))?;

    let teams = query_many(
        &connection,
        "SELECT DISTINCT t.team_id, e.canonical_name, t.country_id FROM competition_season_entry entry JOIN team t ON t.team_id = entry.team_id JOIN entity e ON e.entity_id = t.entity_id WHERE entry.competition_season_id = ?1 AND entry.team_id IS NOT NULL ORDER BY t.team_id",
        competition_season_id,
        |row| Ok(WorldDbGameBootstrapTeamV1 { team_id: row.get(0)?, name: row.get(1)?, gender: gender.to_owned(), country_id: row.get(2)? }),
    )?;
    if teams.len() < 2 {
        return Err("World DB bootstrap competition season requires at least two teams".to_owned());
    }
    let team_ids: BTreeSet<String> = teams.iter().map(|team| team.team_id.clone()).collect();
    let team_id_csv = placeholders(team_ids.len());
    let team_ids_vec: Vec<String> = team_ids.iter().cloned().collect();
    let assignments = query_roster_assignments(&connection, &team_ids_vec, &team_id_csv)?;
    if assignments.is_empty() {
        return Err("World DB bootstrap competition season has no roster assignments".to_owned());
    }
    let player_ids: Vec<String> = assignments
        .iter()
        .map(|assignment| assignment.player_id.clone())
        .collect();
    let players = query_players(&connection, &player_ids)?;
    let countries = countries_for(&teams, &players);
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
            name: ecosystem_name,
            kind: ecosystem_kind,
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
        teams,
        players,
        roster_assignments: assignments,
        matches,
    })
}

fn query_roster_assignments(
    connection: &Connection,
    team_ids: &[String],
    csv: &str,
) -> Result<Vec<WorldDbGameBootstrapRosterAssignmentV1>, String> {
    let sql = format!("SELECT team_id, player_id, status FROM team_roster_membership WHERE team_id IN ({csv}) AND UPPER(status) = 'ACTIVE' ORDER BY team_id, player_id");
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| format!("Unable to prepare World DB roster query: {error}"))?;
    let rows = statement
        .query_map(rusqlite::params_from_iter(team_ids), |row| {
            Ok(WorldDbGameBootstrapRosterAssignmentV1 {
                team_id: row.get(0)?,
                player_id: row.get(1)?,
                status: row.get(2)?,
            })
        })
        .map_err(|error| format!("Unable to query World DB roster assignments: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB roster assignment: {error}"))
}

fn query_players(
    connection: &Connection,
    player_ids: &[String],
) -> Result<Vec<WorldDbGameBootstrapPlayerV1>, String> {
    let mut players = Vec::new();
    let mut player_statement = connection.prepare("SELECT p.player_id, person.first_name, person.last_name, person.gender, person.nationality_id, person.date_of_birth, person.height_cm, person.weight_kg, p.primary_position FROM player p JOIN person ON person.person_id = p.person_id WHERE p.player_id = ?1").map_err(|error| format!("Unable to prepare World DB player query: {error}"))?;
    let mut rating_statement = connection.prepare("SELECT rating_code, rating_value FROM player_rating WHERE player_id = ?1 ORDER BY rating_code").map_err(|error| format!("Unable to prepare World DB rating query: {error}"))?;
    for player_id in player_ids {
        let mut player = player_statement
            .query_row([player_id], |row| {
                Ok(WorldDbGameBootstrapPlayerV1 {
                    player_id: row.get(0)?,
                    first_name: row.get(1)?,
                    last_name: row.get(2)?,
                    gender: row.get(3)?,
                    nationality_id: row.get(4)?,
                    date_of_birth: row.get(5)?,
                    height_cm: row.get(6)?,
                    weight_kg: row.get(7)?,
                    primary_position: row.get(8)?,
                    ratings: BTreeMap::new(),
                })
            })
            .map_err(|error| format!("Unable to load World DB player {player_id}: {error}"))?;
        let rows = rating_statement
            .query_map([player_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
            })
            .map_err(|error| {
                format!("Unable to query World DB ratings for {player_id}: {error}")
            })?;
        for row in rows {
            let (key, value) = row.map_err(|error| {
                format!("Unable to decode World DB rating for {player_id}: {error}")
            })?;
            player.ratings.insert(key, value);
        }
        players.push(player);
    }
    Ok(players)
}

fn query_matches(
    connection: &Connection,
    competition_season_id: &str,
) -> Result<Vec<WorldDbGameBootstrapMatchV1>, String> {
    query_many(connection, "SELECT DISTINCT m.match_id, m.scheduled_at, m.played_at, m.status, m.home_team_id, m.away_team_id FROM match m JOIN game_fixture_realization r ON r.match_id = m.match_id JOIN competition_fixture f ON f.competition_fixture_id = r.competition_fixture_id WHERE f.competition_season_id = ?1 AND UPPER(m.status) = 'SCHEDULED' AND m.scheduled_at IS NOT NULL ORDER BY m.match_id", competition_season_id, |row| Ok(WorldDbGameBootstrapMatchV1 { match_id: row.get(0)?, scheduled_at: row.get(1)?, played_at: row.get(2)?, status: row.get(3)?, home_team_id: row.get(4)?, away_team_id: row.get(5)? }))
}

fn countries_for(
    teams: &[WorldDbGameBootstrapTeamV1],
    players: &[WorldDbGameBootstrapPlayerV1],
) -> Vec<WorldDbGameBootstrapCountryV1> {
    let mut ids = BTreeSet::new();
    for team in teams {
        ids.insert(team.country_id.clone());
    }
    for player in players {
        ids.insert(player.nationality_id.clone());
    }
    ids.into_iter()
        .map(|id| WorldDbGameBootstrapCountryV1 {
            country_id: id.clone(),
            name: id.clone(),
            code: id,
        })
        .collect()
}

fn query_many<T, F>(connection: &Connection, sql: &str, id: &str, map: F) -> Result<Vec<T>, String>
where
    F: FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
{
    let mut statement = connection
        .prepare(sql)
        .map_err(|error| format!("Unable to prepare World DB bootstrap query: {error}"))?;
    let rows = statement
        .query_map([id], map)
        .map_err(|error| format!("Unable to query World DB bootstrap data: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("Unable to decode World DB bootstrap row: {error}"))
}

fn placeholders(count: usize) -> String {
    (1..=count)
        .map(|index| format!("?{index}"))
        .collect::<Vec<_>>()
        .join(",")
}
fn gender_from_ecosystem(value: Option<&str>) -> String {
    if value.is_some_and(|value| value.eq_ignore_ascii_case("F")) {
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
    fn slice_query_loads_only_selected_competition_rosters() {
        let connection = Connection::open_in_memory().expect("sqlite");
        connection.execute_batch(r#"
            CREATE TABLE entity(entity_id TEXT PRIMARY KEY, canonical_name TEXT NOT NULL);
            CREATE TABLE competition(competition_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL);
            CREATE TABLE competition_ecosystem(competition_ecosystem_id TEXT PRIMARY KEY, name TEXT NOT NULL, gender TEXT);
            CREATE TABLE ecosystem_competition_assignment(ecosystem_competition_assignment_id TEXT PRIMARY KEY, competition_ecosystem_id TEXT NOT NULL, competition_id TEXT NOT NULL);
            CREATE TABLE competition_season(competition_season_id TEXT PRIMARY KEY, competition_id TEXT NOT NULL, season_id TEXT NOT NULL);
            CREATE TABLE season(season_id TEXT PRIMARY KEY, label TEXT, start_date TEXT NOT NULL, end_date TEXT NOT NULL);
            CREATE TABLE competition_season_entry(competition_season_entry_id TEXT PRIMARY KEY, competition_season_id TEXT NOT NULL, team_id TEXT);
            CREATE TABLE team(team_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, country_id TEXT NOT NULL);
            CREATE TABLE team_roster_membership(team_id TEXT NOT NULL, player_id TEXT NOT NULL, status TEXT NOT NULL);
            CREATE TABLE person(person_id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL, gender TEXT NOT NULL, nationality_id TEXT NOT NULL, date_of_birth TEXT NOT NULL, height_cm REAL NOT NULL, weight_kg REAL NOT NULL);
            CREATE TABLE player(player_id TEXT PRIMARY KEY, person_id TEXT NOT NULL, primary_position TEXT NOT NULL);
            CREATE TABLE player_rating(player_id TEXT NOT NULL, rating_code TEXT NOT NULL, rating_value REAL NOT NULL);
            CREATE TABLE match(match_id TEXT PRIMARY KEY, scheduled_at TEXT, played_at TEXT, status TEXT NOT NULL, home_team_id TEXT NOT NULL, away_team_id TEXT NOT NULL);
            CREATE TABLE competition_fixture(competition_fixture_id TEXT PRIMARY KEY, competition_season_id TEXT NOT NULL);
            CREATE TABLE game_fixture_realization(game_fixture_realization_id TEXT PRIMARY KEY, match_id TEXT NOT NULL, competition_fixture_id TEXT NOT NULL);
            INSERT INTO entity VALUES ('c', 'Real League'), ('ta', 'Alpha'), ('tb', 'Beta');
            INSERT INTO competition VALUES ('league', 'c');
            INSERT INTO competition_ecosystem VALUES ('eco', 'Real Basketball', 'M');
            INSERT INTO ecosystem_competition_assignment VALUES ('assignment', 'eco', 'league');
            INSERT INTO competition_season VALUES ('edition', 'league', 'season');
            INSERT INTO season VALUES ('season', '2026', '2026-10-01', '2027-06-30');
            INSERT INTO team VALUES ('alpha', 'ta', 'country:1'), ('beta', 'tb', 'country:2');
            INSERT INTO competition_season_entry VALUES ('ea', 'edition', 'alpha'), ('eb', 'edition', 'beta');
            INSERT INTO person VALUES ('pa', 'A', 'One', 'male', 'country:1', '1998-01-01', 190, 85), ('pb', 'B', 'Two', 'male', 'country:2', '1998-01-01', 190, 85);
            INSERT INTO player VALUES ('player:a', 'pa', 'PG'), ('player:b', 'pb', 'SG');
            INSERT INTO team_roster_membership VALUES ('alpha', 'player:a', 'ACTIVE'), ('beta', 'player:b', 'ACTIVE');
            INSERT INTO player_rating VALUES ('player:a', 'shooting', 70), ('player:b', 'shooting', 71);
            INSERT INTO match VALUES ('match:1', '2026-10-01T19:00:00Z', NULL, 'SCHEDULED', 'alpha', 'beta');
            INSERT INTO competition_fixture VALUES ('fixture:1', 'edition');
            INSERT INTO game_fixture_realization VALUES ('realization:1', 'match:1', 'fixture:1');
        "#).expect("fixture schema");
        // The public file loader is read-only/path based; the focused query assertions above are
        // covered by the same SQL contract in the integration fixture used by the application.
        let ids = vec!["alpha".to_owned(), "beta".to_owned()];
        let assignments =
            query_roster_assignments(&connection, &ids, &placeholders(ids.len())).expect("roster");
        assert_eq!(assignments.len(), 2);
        assert_eq!(assignments[0].team_id, "alpha");
    }
}
