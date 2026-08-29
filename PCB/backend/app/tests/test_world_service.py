import json
import sqlite3
import unittest
from pathlib import Path

from backend.app.infra.db import init_schema
from backend.app.services import savegame_service
from backend.app.services.world_service import advance_day, finalize_day, prepare_day


class WorldAdvanceDayTest(unittest.TestCase):
    def setUp(self) -> None:
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys=ON;")
        init_schema(self.conn)
        savegame_service.ensure_savegame(self.conn, db_path=Path("test.sqlite"))

        now = 0
        team_data = {
            "league_id": "ACB",
            "budget": 2_500_000,
            "reputation": 500,
            "roster_size": 12,
            "tier": 2,
            "current_date": "",
            "shortlist": [],
            "active_negotiations": [],
            "agency_relationships": {},
            "transfer_history": [],
            "market_trends": {},
        }
        self.conn.execute(
            "INSERT INTO team (name, data_json, updated_at) VALUES (?, ?, ?)",
            ("Test Team", json.dumps(team_data, ensure_ascii=True), now),
        )
        self.conn.commit()
        self.team_id = int(self.conn.execute("SELECT id FROM team LIMIT 1").fetchone()["id"])

    def tearDown(self) -> None:
        self.conn.close()

    def test_world_advance_day_sets_next_date(self) -> None:
        res = advance_day(self.conn, {"team_id": self.team_id, "training": {"session_count": 0}})
        self.assertTrue(res.get("ok"))
        self.assertIsInstance(res.get("date"), str)
        self.assertIsInstance(res.get("next_date"), str)
        self.assertNotEqual(res.get("date"), res.get("next_date"))

    def test_prepare_and_finalize_day(self) -> None:
        prep = prepare_day(self.conn, {"team_id": self.team_id, "training": {"session_count": 0}})
        self.assertTrue(prep.get("ok"))
        date_value = prep.get("date")
        self.assertIsInstance(date_value, str)
        fin = finalize_day(
            self.conn,
            {
                "team_id": self.team_id,
                "date": date_value,
                "summary": {"training": {"sessions": 0, "load": 0}, "market": {"resolved": 0}, "match": {}},
            },
        )
        self.assertTrue(fin.get("ok"))
        self.assertIsInstance(fin.get("next_date"), str)


if __name__ == "__main__":
    unittest.main()
