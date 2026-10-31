"""Contract tests for the opt-in, NON-PUBLISHED simulation candidate generator.

Run with:
  python -m unittest discover -s scripts/playable -p 'test_worlddb_v2_simulation_fallback.py'
"""
import copy
import importlib.util
import unittest
from pathlib import Path

SOURCE = Path(__file__).with_name("worlddb-v2-simulation-fallback.py")
SPEC = importlib.util.spec_from_file_location("bdm_simulation_fallback", SOURCE)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def fixtures():
    matrix = {"total": 102, "competitions": []}
    batch = {"total": 102, "results": []}
    published = []
    for n in range(1, 103):
        source = f"pbm:DYN_championnat:{n}"
        count = 353 if n == 71 else 13 if n == 101 else 12
        certified = n <= 4
        config = {
            "sourceCompetitionId": source, "nativeCompetitionId": f"competition:TEST:{n}",
            "editionId": f"edition:TEST:{n}:2025-26", "teamCount": count,
            "ecosystemId": f"ecosystem:TEST:{n}", "countryCode": "ESP",
            "countryId": 8, "currencyCode": "EUR", "name": f"League {n}",
            "calendar": "FORMAT_DERIVED_SIMULATION"
        }
        matrix["competitions"].append({
            "source_id": source, "competition": f"League {n}",
            "status": "PLAYABLE" if certified else "NEEDS_MAPPING",
            "original_club_ids_preserved": True,
            "pbm": {"clubs": count}
        })
        batch["results"].append({"source_id": source, "source_build": "PASS", "config": config})
        if certified:
            published.append(config)
    return matrix, batch, published


class GeneratedCompetitionCandidateTests(unittest.TestCase):
    def test_102_candidates_are_separate_and_four_verified_are_unchanged(self):
        matrix, batch, published = fixtures()
        originals = copy.deepcopy((matrix, batch, published))
        result = MODULE.build_package(matrix, batch, published)
        self.assertEqual((len(result["catalog"]), len(result["formats"])), (102, 97))
        self.assertEqual(result["catalog"][:4], published)
        self.assertEqual(result["manifest"]["certified_new_competitions"], 0)
        self.assertEqual((matrix, batch, published), originals)
        self.assertEqual(sum(c.get("nativeStatus") == "CANDIDATE_NATIVE_PENDING" for c in result["catalog"][4:]), 97)
        self.assertEqual(sum(c.get("nativeStatus") == "CANDIDATE_NCAA_MEMBERSHIP_PENDING" for c in result["catalog"][4:]), 1)
        self.assertEqual(sum(c["formatProvenance"] == "GENERATED_SIMULATION" for c in result["catalog"][4:]), 97)
        self.assertEqual(sum(c["formatProvenance"] == "DOCUMENTED_NCAA_REFERENCE_UNRECONCILED" for c in result["catalog"][4:]), 1)
        self.assertNotIn("competition:BDM-SIM:dyn_championnat-71", [d["competition_id"] for d in result["formats"]])

    def test_generated_format_is_explicitly_non_official_and_odd_clubs_are_preserved(self):
        matrix, batch, published = fixtures()
        result = MODULE.build_package(matrix, batch, published)
        doc = next(f for f in result["formats"] if "championnat-101" in f["competition_id"])
        self.assertIn("NOT AN OFFICIAL", doc["notes"])
        self.assertEqual(doc["variants"][0]["nodes"][0]["team_count"], 13)
        self.assertEqual(doc["variants"][0]["nodes"][0]["pairing"]["meetings_per_pair"], 2)
        self.assertEqual(doc["sources"][0]["type"], "SECONDARY")
        audit = next(e for e in result["manifest"]["evidence"] if e["source_id"].endswith(":101"))
        self.assertEqual(audit["expected_regular_games"], 156)
        ncaa = next(e for e in result["manifest"]["evidence"] if e["source_id"].endswith(":71"))
        self.assertTrue(ncaa["no_all_team_double_round_robin"])
        self.assertIsNone(ncaa["expected_regular_games"])
        self.assertEqual(result["ncaa_plan"]["reference_conferences"], 32)
        self.assertEqual(result["ncaa_plan"]["reference_clubs"], 365)
        self.assertEqual(result["ncaa_plan"]["source_clubs"], 353)
        self.assertEqual(result["ncaa_plan"]["reference_difference"], 12)
        self.assertEqual(result["ncaa_plan"]["team_membership"], "REQUIRES_SOURCE_IDENTITY_RECONCILIATION")
        self.assertEqual(len(result["ncaa_plan"]["conference_formats"]), 32)

    def test_ncaa_never_uses_a_single_353_team_round_robin_even_if_called_directly(self):
        with self.assertRaisesRegex(ValueError, "NCAA D1 must use its existing conference"):
            MODULE.simulation_document(MODULE.NCAA_SOURCE_ID, "NCAA I", 353)

    def test_missing_or_conflicting_pbm_source_fails_closed(self):
        matrix, batch, published = fixtures()
        batch["results"][-1]["source_build"] = "BLOCKED"
        with self.assertRaisesRegex(ValueError, "source build is not certified"):
            MODULE.build_package(matrix, batch, published)
        batch["results"][-1]["source_build"] = "PASS"
        batch["results"][-1]["config"]["teamCount"] = 10
        with self.assertRaisesRegex(ValueError, "source team count/config mismatch"):
            MODULE.build_package(matrix, batch, published)

    def test_duplicate_or_rewritten_certified_mapping_fails_closed(self):
        matrix, batch, published = fixtures()
        matrix["competitions"][-1]["source_id"] = matrix["competitions"][0]["source_id"]
        with self.assertRaisesRegex(ValueError, "Duplicate PBM identity"):
            MODULE.build_package(matrix, batch, published)
        matrix, batch, published = fixtures()
        # The fixture shares config objects with published entries. Replace only
        # the incoming batch copy, as happens when parsing separate JSON files.
        batch["results"][0]["config"] = {
            **batch["results"][0]["config"],
            "nativeCompetitionId": "competition:INVALID",
        }
        with self.assertRaisesRegex(ValueError, "Existing official runtime mapping changed"):
            MODULE.build_package(matrix, batch, published)


    def test_reuses_complete_mapped_native_format_before_generic_simulation(self):
        matrix, batch, published = fixtures()
        league = next(item for item in matrix["competitions"] if item["source_id"].endswith(":44"))
        league["native_format_id"] = "competition:NAM:nba"
        league["format_evidence_kind"] = "RUNTIME_DOCUMENT"
        league["pbm"]["clubs"] = 30
        source = next(item for item in batch["results"] if item["source_id"].endswith(":44"))
        source["config"]["teamCount"] = 30
        reference = {
            "competition_id": "competition:NAM:nba",
            "competition_season_id": "edition:NAM:nba:2025-26",
            "status": "COMPLETE",
            "variants": [{"nodes": [{
                "key": "REGULAR_SEASON", "role": "REGULAR_SEASON",
                "team_count": 30, "pairing": {"type": "FIXED_SCHEDULE"},
            }]}],
        }
        result = MODULE.build_package(matrix, batch, published, reusable_formats=[reference])
        reused = next(config for config in result["catalog"] if config["sourceCompetitionId"].endswith(":44"))
        self.assertEqual(reused["nativeCompetitionId"], reference["competition_id"])
        self.assertEqual(reused["editionId"], reference["competition_season_id"])
        self.assertEqual(reused["formatProvenance"], "REUSED_DOCUMENTED_FORMAT")
        self.assertEqual(reused["nativeStatus"], "CANDIDATE_DOCUMENTED_FORMAT_ENGINE_PENDING")
        self.assertEqual(result["manifest"]["reused_documented_format_candidates"], 1)
        self.assertEqual(result["manifest"]["generated_simulation_candidates"], 96)
        self.assertFalse(any("championnat-44" in doc["competition_id"] for doc in result["formats"]))

    def test_keeps_known_pgm_reference_when_document_not_yet_imported(self):
        matrix, batch, published = fixtures()
        league = next(item for item in matrix["competitions"] if item["source_id"].endswith(":29"))
        league["native_format_id"] = "competition:FRA:nm1"
        league["format_evidence_kind"] = "RUNTIME_DOCUMENT"
        result = MODULE.build_package(matrix, batch, published)
        generated = next(config for config in result["catalog"] if config["sourceCompetitionId"].endswith(":29"))
        self.assertEqual(generated["formatProvenance"], "GENERATED_SIMULATION")
        self.assertEqual(generated["formatReferenceId"], "competition:FRA:nm1")
        self.assertEqual(generated["formatReferenceResolution"], "DOCUMENTED_REFERENCE_NOT_USABLE")
        self.assertEqual(result["manifest"]["generated_with_documented_reference"], 1)
        self.assertEqual(result["manifest"]["reused_documented_format_candidates"], 0)
        self.assertEqual(len(result["formats"]), 97)

    def test_does_not_guess_among_two_matching_pgm_editions(self):
        matrix, batch, published = fixtures()
        league = next(item for item in matrix["competitions"] if item["source_id"].endswith(":44"))
        league["native_format_id"] = "competition:NAM:nba"
        docs = [{"competition_id": "competition:NAM:nba",
                 "competition_season_id": f"edition:NAM:nba:{edition}",
                 "status": "COMPLETE",
                 "variants": [{"nodes": [{"role": "REGULAR_SEASON", "team_count": 12}]}]}
                for edition in ("2025-26", "2026-27")]
        result = MODULE.build_package(matrix, batch, published, reusable_formats=docs)
        config = next(item for item in result["catalog"] if item["sourceCompetitionId"].endswith(":44"))
        self.assertEqual(config["formatProvenance"], "GENERATED_SIMULATION")
        self.assertEqual(config["formatReferenceResolution"], "AMBIGUOUS_DOCUMENTED_EDITION")
        self.assertEqual(result["manifest"]["generated_simulation_candidates"], 97)


if __name__ == "__main__":
    unittest.main()
