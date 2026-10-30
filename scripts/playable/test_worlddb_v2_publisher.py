"""Reject accidental publication of simulated leagues inferred only from one family."""
import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("worlddb-v2-publish-catalog.py")
SPEC = importlib.util.spec_from_file_location("worlddb_publisher", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

REQUIRED = [
    "native-new-game-league-club", "original-roster",
    "real-match-acta-standings", "contact-offer-governance-sign",
    "renew-original-contract", "close-load-continue"
]


class SimulatedLeaguePublicationTests(unittest.TestCase):
    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory()
        self.addCleanup(self.workspace.cleanup)
        self.root = Path(self.workspace.name)
        (self.root / "docs/playable/evidence/worlddb-v2-03").mkdir(parents=True)
        (self.root / "src/data/worlddb-v2").mkdir(parents=True)
        self.verified = [f"pbm:DYN_championnat:{n}" for n in range(1, 5)]
        self.write("docs/playable/evidence/worlddb-v2-03/compatibility.json", {
            "competitions": [{"source_id": key, "status": "PLAYABLE"} for key in self.verified]
        })
        self.write("src/data/worlddb-v2/competitions.json", [
            {"sourceCompetitionId": key, "nativeCompetitionId": f"verified:{n}"}
            for n, key in enumerate(self.verified)
        ])
        results = [{
            "source_id": key, "minimum_flow": "PASS", "family_signature": "verified-family",
            "config": {"sourceCompetitionId": key, "nativeCompetitionId": f"verified:{n}"}
        } for n, key in enumerate(self.verified)]
        for index in (101, 102):
            key = f"pbm:DYN_championnat:{index}"
            results.append({
                "source_id": key, "minimum_flow": "PASS",
                "family_signature": "generated-round-robin",
                "format_mode": "GENERATED_SIMULATION_CANDIDATE",
                "market_flow": "PASS" if index == 101 else "NOT_TESTED",
                "config": {"sourceCompetitionId": key, "nativeCompetitionId": f"simulation:{index}",
                           "formatProvenance": "GENERATED_SIMULATION"},
            })
        self.write("results.json", {"results": results})
        self.write("proof.json", {"competition": "pbm:DYN_championnat:101", "steps": [
            {"name": name, "status": "PASS"} for name in REQUIRED
        ]})

    def write(self, path, obj):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(obj), encoding="utf-8")

    def run_publisher(self, *args):
        before = Path.cwd()
        original = MODULE.BASE
        try:
            os.chdir(self.root)
            MODULE.BASE = self.root
            with patch.object(sys, "argv", ["publish", "--results", "results.json", *args]):
                with contextlib.redirect_stdout(io.StringIO()):
                    MODULE.main()
        finally:
            MODULE.BASE = original
            os.chdir(before)

    def test_one_accepted_generated_format_never_certifies_other_97_by_family(self):
        self.run_publisher("--native-evidence", "proof.json")
        rows = json.loads((self.root / "src/data/worlddb-v2/competitions.json").read_text())
        keys = {row["sourceCompetitionId"] for row in rows}
        self.assertEqual(keys, {*self.verified, "pbm:DYN_championnat:101"})
        self.assertNotIn("pbm:DYN_championnat:102", keys)
        self.assertEqual(next(row for row in rows if row["sourceCompetitionId"].endswith(":101"))
                         ["formatProvenance"], "GENERATED_SIMULATION")

    def test_qa_candidates_do_not_change_public_catalog(self):
        original = (self.root / "src/data/worlddb-v2/competitions.json").read_bytes()
        self.run_publisher("--candidates")
        candidates = json.loads((self.root / ".worlddb-v2/batch-04/candidate-competitions.json").read_text())
        self.assertEqual(len(candidates), 6)
        self.assertTrue(any(c.get("nativeStatus") == "CANDIDATE_NATIVE_PENDING" for c in candidates))
        self.assertEqual((self.root / "src/data/worlddb-v2/competitions.json").read_bytes(), original)
        with self.assertRaisesRegex(ValueError, "must not overwrite"):
            self.run_publisher("--candidates", "--output", "src/data/worlddb-v2/competitions.json")

    def test_generated_league_without_market_pass_is_not_published_even_with_native_proof(self):
        proof = json.loads((self.root / "proof.json").read_text())
        proof["competition"] = "pbm:DYN_championnat:102"
        self.write("proof-102.json", proof)
        self.run_publisher("--native-evidence", "proof-102.json")
        keys = {row["sourceCompetitionId"] for row in
                json.loads((self.root / "src/data/worlddb-v2/competitions.json").read_text())}
        self.assertEqual(keys, set(self.verified))


if __name__ == "__main__":
    unittest.main()
