#!/usr/bin/env python3
"""Read-only audit of World DB player_position source evidence.

Usage:
    python scripts/audit_worlddb_positions.py "C:\path\to\world.db"
    python scripts/audit_worlddb_positions.py "C:\path\to\world.db" --name Alleman
No database changes, derived eligibility labels, or inferred position repairs.
"""
import argparse
import json
import sqlite3
from pathlib import Path


def audit(database: Path, names: list[str]) -> dict:
    uri = database.expanduser().resolve().as_uri() + "?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    try:
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(player_position)")}
        required = {"person_id", "position_code", "is_primary", "familiarity"}
        if not required <= columns:
            raise RuntimeError(f"player_position lacks required columns: {sorted(required - columns)}")
        scalar = lambda sql: connection.execute(sql).fetchone()[0]
        grouped = connection.execute("""
            SELECT person_id, COUNT(*) AS rows, COUNT(DISTINCT position_code) AS unique_positions,
                   SUM(CASE WHEN is_primary = 1 THEN 1 ELSE 0 END) AS primary_count
            FROM player_position GROUP BY person_id
        """).fetchall()
        results = {
            "database": str(database.resolve()),
            "players_with_positions": len(grouped),
            "players_with_five_distinct_positions": sum(row["unique_positions"] == 5 for row in grouped),
            "players_with_invalid_primary_count": sum(row["primary_count"] != 1 for row in grouped),
            "players_with_duplicate_position_rows": sum(row["rows"] != row["unique_positions"] for row in grouped),
            "position_row_count": scalar("SELECT COUNT(*) FROM player_position"),
            "position_row_distribution": {
                str(count): sum(row["unique_positions"] == count for row in grouped)
                for count in sorted({row["unique_positions"] for row in grouped})
            },
            "familiarity_storage_types": {
                row[0]: row[1] for row in connection.execute(
                    "SELECT typeof(familiarity),COUNT(*) FROM player_position GROUP BY typeof(familiarity)"
                )
            },
            "positions_per_code": {
                row[0]: row[1] for row in connection.execute(
                    "SELECT position_code,COUNT(*) FROM player_position GROUP BY position_code"
                )
            },
        }
        if names:
            person_tables = {
                row["name"] for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
            if "person_name" not in person_tables:
                results["name_lookup_error"] = "person_name is unavailable"
            else:
                matches = []
                for name in names:
                    for person in connection.execute("""
                        SELECT DISTINCT pn.person_id,pn.given_name,pn.family_name
                        FROM person_name pn
                        WHERE LOWER(pn.given_name || ' ' || pn.family_name) LIKE ?
                        ORDER BY pn.family_name,pn.given_name
                    """, (f"%{name.lower()}%",)):
                        positions = [dict(row) for row in connection.execute("""
                            SELECT position_code,is_primary,familiarity,typeof(familiarity) AS familiarity_type
                            FROM player_position WHERE person_id = ?
                            ORDER BY is_primary DESC,familiarity DESC,position_code
                        """, (person["person_id"],))]
                        matches.append({"person_id": person["person_id"],
                                        "name": f"{person['given_name']} {person['family_name']}",
                                        "positions": positions})
                results["name_matches"] = matches
        return results
    finally:
        connection.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    parser.add_argument("--name", action="append", default=[], help="Find players by full/partial name")
    args = parser.parse_args()
    print(json.dumps(audit(args.database, args.name), ensure_ascii=False, indent=2))
