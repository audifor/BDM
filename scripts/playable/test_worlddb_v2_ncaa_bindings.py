"""NCAA source identity and 32-conference binding tests; no private PBM data needed."""
import copy
import importlib.util
import unittest
from pathlib import Path

SOURCE = Path(__file__).with_name("worlddb-v2-ncaa-bindings.py")
SPEC = importlib.util.spec_from_file_location("worlddb_v2_ncaa_binding", SOURCE)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def fixture():
    ids = [f"pbm:DYN_equipe:{i}" for i in range(1, 354)]
    names = [f"competition:USA:ncaa-d1-men:sim-{i}" for i in range(32)]
    plan = {
        "source_competition_id": MODULE.NCAA, "source_clubs": 353,
        "reference_conferences": 32, "reference_clubs": 365,
        "conference_formats": [{"reference_competition": n} for n in names]
    }
    snapshot = {
        "competitions": [{"entity_id": MODULE.NCAA}],
        "clubs": [{"entity_id": key} for key in ids],
        "manifest": {"master": {"sha256": "hash-of-private-source"}}
    }
    bindings = {
        "source_competition_id": MODULE.NCAA,
        "master_sha256": snapshot["manifest"]["master"]["sha256"],
        "assignments": [
            {"teamId": key, "conferenceCompetitionId": names[i % 32], "evidence": "source-binding-row"}
            for i, key in enumerate(ids)
        ]
    }
    return snapshot, plan, bindings


class NcaaConferenceBindingTests(unittest.TestCase):
    def test_exact_original_clubs_bind_to_32_conferences_without_365_club_promotion(self):
        snapshot, plan, membership = fixture()
        originals = copy.deepcopy((snapshot, plan, membership))
        result = MODULE.bind_ncaa(snapshot, plan, membership)
        self.assertEqual(result["source_clubs"], 353)
        self.assertEqual(result["reference_clubs"], 365)
        self.assertEqual(sum(result["conference_sizes"].values()), 353)
        self.assertEqual(len(result["conference_sizes"]), 32)
        self.assertEqual(result["native_calendar"], "generateNcaaLikeSchedule")
        self.assertEqual(result["status"], "IDENTITIES_LINKED_SPORTING_ACCEPTANCE_PENDING")
        self.assertEqual((snapshot, plan, membership), originals)

    def test_disallow_duplicate_and_missing_original_club(self):
        snapshot, plan, membership = fixture()
        membership["assignments"][-1]["teamId"] = membership["assignments"][0]["teamId"]
        with self.assertRaisesRegex(ValueError, "duplicate or omit"):
            MODULE.bind_ncaa(snapshot, plan, membership)

    def test_no_implicit_conference_or_unsupported_edition(self):
        snapshot, plan, membership = fixture()
        del membership["assignments"][0]["evidence"]
        with self.assertRaisesRegex(ValueError, "explicit source evidence"):
            MODULE.bind_ncaa(snapshot, plan, membership)
        snapshot, plan, membership = fixture()
        plan["reference_clubs"] = 353
        with self.assertRaisesRegex(ValueError, "reference changed"):
            MODULE.bind_ncaa(snapshot, plan, membership)

    def test_no_phantom_teams_or_unknown_conferences(self):
        snapshot, plan, membership = fixture()
        membership["assignments"][0]["teamId"] = "bdm:generated:phantom-team"
        with self.assertRaisesRegex(ValueError, "duplicate or omit"):
            MODULE.bind_ncaa(snapshot, plan, membership)
        snapshot, plan, membership = fixture()
        membership["assignments"][0]["conferenceCompetitionId"] = "invented-conference"
        with self.assertRaisesRegex(ValueError, "Unknown NCAA conference"):
            MODULE.bind_ncaa(snapshot, plan, membership)


if __name__ == "__main__":
    unittest.main()
