from __future__ import annotations

import time
import sqlite3
from dataclasses import dataclass
from typing import Iterable, List


@dataclass(frozen=True)
class Migration:
    id: str
    sql: str


MIGRATIONS: List[Migration] = [
    Migration(
        "001_core_tables",
        """
        CREATE TABLE IF NOT EXISTS team (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            data_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS player (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            data_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS contract (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            data_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_contract_player ON contract (player_id);
        CREATE INDEX IF NOT EXISTS idx_contract_team ON contract (team_id);

        CREATE TABLE IF NOT EXISTS match (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            home_team_id INTEGER NOT NULL,
            away_team_id INTEGER NOT NULL,
            home_score INTEGER NOT NULL,
            away_score INTEGER NOT NULL,
            possessions INTEGER NOT NULL,
            data_json TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_match_home ON match (home_team_id);
        CREATE INDEX IF NOT EXISTS idx_match_away ON match (away_team_id);

        CREATE TABLE IF NOT EXISTS event_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL,
            seq INTEGER NOT NULL,
            clock INTEGER NOT NULL,
            team TEXT NOT NULL,
            event TEXT NOT NULL,
            data_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_event_match ON event_log (match_id);
        CREATE INDEX IF NOT EXISTS idx_event_seq ON event_log (match_id, seq);

        CREATE TABLE IF NOT EXISTS agency (
            agency_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            data_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agent (
            agent_id TEXT PRIMARY KEY,
            agency_id TEXT NOT NULL,
            name TEXT NOT NULL,
            data_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_agent_agency ON agent (agency_id);

        CREATE TABLE IF NOT EXISTS smartphone_content (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER,
            content_type TEXT NOT NULL,
            data_json TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_smartphone_content_team ON smartphone_content (team_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_smartphone_content_type ON smartphone_content (content_type, created_at);

        CREATE TABLE IF NOT EXISTS smartphone_event (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER,
            event_type TEXT NOT NULL,
            event_json TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_smartphone_event_team ON smartphone_event (team_id, created_at);
        """,
    ),
    Migration(
        "002_phase1_foundation",
        """
        CREATE TABLE IF NOT EXISTS savegame (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            current_season_id INTEGER,
            data_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS season (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            savegame_id INTEGER,
            year INTEGER NOT NULL,
            name TEXT,
            start_date TEXT,
            end_date TEXT,
            data_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(savegame_id) REFERENCES savegame(id)
        );

        CREATE INDEX IF NOT EXISTS idx_season_savegame ON season (savegame_id, year);

        CREATE TABLE IF NOT EXISTS competition (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            savegame_id INTEGER,
            league_id TEXT NOT NULL,
            name TEXT NOT NULL,
            level INTEGER,
            universe TEXT,
            ruleset TEXT,
            data_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(savegame_id) REFERENCES savegame(id)
        );

        CREATE INDEX IF NOT EXISTS idx_competition_league ON competition (league_id, level);

        CREATE TABLE IF NOT EXISTS fixture (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season_id INTEGER NOT NULL,
            competition_id INTEGER NOT NULL,
            round INTEGER,
            stage TEXT,
            home_team_id INTEGER NOT NULL,
            away_team_id INTEGER NOT NULL,
            date TEXT,
            time TEXT,
            status TEXT,
            home_score INTEGER,
            away_score INTEGER,
            data_json TEXT NOT NULL,
            FOREIGN KEY(season_id) REFERENCES season(id),
            FOREIGN KEY(competition_id) REFERENCES competition(id)
        );

        CREATE INDEX IF NOT EXISTS idx_fixture_comp_round ON fixture (competition_id, round);
        CREATE INDEX IF NOT EXISTS idx_fixture_date ON fixture (date);
        CREATE INDEX IF NOT EXISTS idx_fixture_team ON fixture (home_team_id, away_team_id);

        CREATE TABLE IF NOT EXISTS standing (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season_id INTEGER NOT NULL,
            competition_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            position INTEGER,
            played INTEGER,
            wins INTEGER,
            losses INTEGER,
            points_for INTEGER,
            points_against INTEGER,
            points INTEGER,
            streak TEXT,
            data_json TEXT NOT NULL,
            FOREIGN KEY(season_id) REFERENCES season(id),
            FOREIGN KEY(competition_id) REFERENCES competition(id)
        );

        CREATE INDEX IF NOT EXISTS idx_standing_comp_team ON standing (competition_id, team_id);
        CREATE INDEX IF NOT EXISTS idx_standing_position ON standing (competition_id, position);

        CREATE TABLE IF NOT EXISTS person (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            data_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_person_type ON person (type, name);

        CREATE TABLE IF NOT EXISTS person_assignment (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            role_id TEXT,
            department TEXT,
            start_date TEXT,
            end_date TEXT,
            data_json TEXT NOT NULL,
            FOREIGN KEY(person_id) REFERENCES person(id)
        );

        CREATE INDEX IF NOT EXISTS idx_person_assignment_team ON person_assignment (team_id, role_id);
        CREATE INDEX IF NOT EXISTS idx_person_assignment_person ON person_assignment (person_id);

        CREATE TABLE IF NOT EXISTS transfer (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season_id INTEGER,
            player_id INTEGER NOT NULL,
            from_team_id INTEGER,
            to_team_id INTEGER,
            transfer_type TEXT NOT NULL,
            fee INTEGER,
            date TEXT,
            data_json TEXT NOT NULL,
            FOREIGN KEY(season_id) REFERENCES season(id)
        );

        CREATE INDEX IF NOT EXISTS idx_transfer_season ON transfer (season_id);
        CREATE INDEX IF NOT EXISTS idx_transfer_player ON transfer (player_id);

        CREATE TABLE IF NOT EXISTS injury (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL,
            team_id INTEGER,
            start_date TEXT,
            end_date TEXT,
            status TEXT,
            severity TEXT,
            data_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_injury_player ON injury (player_id, status);

        CREATE TABLE IF NOT EXISTS scout_report (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            scout_id INTEGER,
            created_at INTEGER NOT NULL,
            expires_at INTEGER,
            accuracy INTEGER,
            data_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_scout_report_player ON scout_report (player_id, team_id);
        """,
    ),
    Migration(
        "003_gm_system",
        """
        CREATE TABLE IF NOT EXISTS gm_event (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER,
            event_type TEXT NOT NULL,
            severity TEXT,
            state TEXT,
            title TEXT,
            body TEXT,
            event_date TEXT,
            data_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_gm_event_team ON gm_event (team_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_gm_event_date ON gm_event (team_id, event_date);

        CREATE TABLE IF NOT EXISTS gm_decision (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER,
            team_id INTEGER,
            state TEXT NOT NULL,
            choice_key TEXT,
            options_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            resolved_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_gm_decision_team ON gm_decision (team_id, state);

        CREATE TABLE IF NOT EXISTS gm_agenda (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER,
            event_id INTEGER,
            date TEXT,
            time TEXT,
            title TEXT,
            description TEXT,
            kind TEXT,
            data_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_gm_agenda_team_date ON gm_agenda (team_id, date);
        """,
    ),
]


def apply_migrations(conn: sqlite3.Connection, migrations: Iterable[Migration] | None = None) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        "id TEXT PRIMARY KEY, "
        "applied_at INTEGER NOT NULL"
        ")"
    )
    rows = conn.execute("SELECT id FROM schema_migrations").fetchall()
    applied = {row["id"] for row in rows}

    for migration in migrations or MIGRATIONS:
        if migration.id in applied:
            continue
        conn.executescript(migration.sql)
        conn.execute(
            "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
            (migration.id, int(time.time())),
        )
        conn.commit()
