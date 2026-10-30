#!/usr/bin/env python3
"""Generate quarantined BDM simulation-format candidates for all 102 PBM selections.

This does NOT publish NEW GAME entries or certify a league. Original PBM clubs,
players, source documents and the four existing playable formats are untouched.
Use the native batch runner and Windows acceptance before publishing candidates.
"""
import argparse
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MATRIX = ROOT / "docs/playable/evidence/worlddb-v2-04/family-matrix.json"
INDEX = Path(os.environ.get("BDM_WORLDDB_V2_BATCH_INDEX", str(ROOT / ".worlddb-v2/batch-04/index.json")))
# The isolated V2-04 worktree owns its ignored, real PBM source-build artifacts.
# This is an authoring fallback, never a runtime dependency or a redistributable path.
if not INDEX.is_file() and "BDM_WORLDDB_V2_BATCH_INDEX" not in os.environ:
    previous = Path("C:/BDM-worktrees/worlddb-v2-04/.worlddb-v2/batch-04/index.json")
    if previous.is_file():
        INDEX = previous
PUBLISHED = ROOT / "src/data/worlddb-v2/competitions.json"
OUTPUT = ROOT / ".worlddb-v2/generated-simulation-candidates"
SOURCE_URL = "https://github.com/audifor/BDM/blob/main/scripts/playable/worlddb-v2-simulation-fallback.py"
MASTER_SHA = "f1624039945c253a6bee2d5c793f58fb753443c5f03b549eba9acd4826dec58f"


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def simulation_document(source_id, name, participants):
    if not source_id.startswith("pbm:DYN_championnat:"):
        raise ValueError("Unexpected PBM competition identity: " + source_id)
    if not isinstance(participants, int) or participants < 2:
        raise ValueError("Too few original clubs for simulation: " + source_id)
    suffix = source_id.removeprefix("pbm:").replace(":", "-").lower()
    competition = "competition:BDM-SIM:" + suffix
    edition = "edition:BDM-SIM:" + suffix + ":generated"
    document = {
        "schema_version": "1.0",
        "competition_id": competition,
        "competition_season_id": edition,
        "season_label": "BDM generated season",
        "status": "COMPLETE",
        "notes": (
            "GENERATED_SIMULATION, NOT AN OFFICIAL SPORTING FORMAT. "
            "BDM gameplay fallback only: original PBM clubs, deterministic double "
            "round robin, 2/1 classification with the existing minileague policy, "
            "no imported playoffs, promotions, relegations or federation calendar. "
            "COMPLETE describes this synthetic contract, not official fidelity."
        ),
        "variants": [{
            "key": "BDM_SIMULATION", "name": name + " (simulated)",
            "is_real_variant": False,
            "entry_selection": {"method": "DIRECT", "payload": {"team_count": participants}},
            "seeding": {"scheme_type": "RANK_BASED", "basis": [{
                "type": "CLASSIFICATION_POINTS_MINILEAGUE_2_1_V1",
                "source": "BDM_GENERATED_SIMULATION, not a federation regulation",
                "terminal_tie": "EXTERNAL_DRAW_REQUIRED"
            }]},
            "nodes": [{
                "key": "REGULAR_SEASON", "node_type": "STAGE",
                "role": "REGULAR_SEASON", "specialized_type": "REGULAR_SEASON",
                "team_count": participants,
                "pairing": {"type": "ROUND_ROBIN", "meetings_per_pair": 2,
                            "payload": {"policy": "BDM_GENERATED_DOUBLE_ROUND_ROBIN"}},
                "opponent_scope": {"type": "ALL_STAGE", "payload": {}},
                "hosting": {"rule_type": "BALANCED", "payload": {}}
            }],
            "edges": []
        }],
        "consequences": [],
        "sources": [{"url": SOURCE_URL, "type": "SECONDARY",
                     "scope": "BDM generated gameplay policy ONLY; not an official source"}]
    }
    return document


def build_package(matrix, batch, published):
    if matrix.get("total") != 102 or len(matrix.get("competitions", [])) != 102:
        raise ValueError("Require the certified 102-row family matrix")
    if batch.get("total") != 102 or len(batch.get("results", [])) != 102:
        raise ValueError("Require 102 Runtime V1 source-build results")
    rows = {r["source_id"]: r for r in matrix["competitions"]}
    builds = {r["source_id"]: r for r in batch["results"]}
    existing = {r["sourceCompetitionId"]: r for r in published}
    if len(rows) != 102 or len(builds) != 102 or len(existing) != len(published):
        raise ValueError("Duplicate PBM identity")
    if set(rows) != set(builds) or not set(existing) <= set(rows):
        raise ValueError("PBM inventory and Runtime source builds disagree")
    if len(existing) != 4 or any(rows[i]["status"] != "PLAYABLE" for i in existing):
        raise ValueError("Existing four certified league configurations must remain untouched")
    candidates = list(published)
    documents = []
    evidence = []
    for source_id in sorted(rows, key=lambda x: int(x.rsplit(":", 1)[-1])):
        row, build = rows[source_id], builds[source_id]
        expected_count = row["pbm"]["clubs"]
        if build.get("source_build") != "PASS" or not row.get("original_club_ids_preserved"):
            raise ValueError("PBM source build is not certified: " + source_id)
        config = build["config"]
        if config.get("sourceCompetitionId") != source_id or config.get("teamCount") != expected_count:
            raise ValueError("PBM source team count/config mismatch: " + source_id)
        if source_id in existing:
            if config["nativeCompetitionId"] != existing[source_id]["nativeCompetitionId"]:
                raise ValueError("Existing official runtime mapping changed: " + source_id)
            continue
        document = simulation_document(source_id, row["competition"], expected_count)
        documents.append(document)
        candidates.append({
            **config,
            "nativeCompetitionId": document["competition_id"],
            "editionId": document["competition_season_id"],
            "ecosystemId": "ecosystem:BDM-SIM:" + source_id.removeprefix("pbm:").replace(":", "-").lower(),
            "name": row["competition"],
            "calendar": "FORMAT_DERIVED_SIMULATION",
            "nativeStatus": "CANDIDATE_NATIVE_PENDING",
            "formatProvenance": "GENERATED_SIMULATION"
        })
        games = expected_count * (expected_count - 1)
        evidence.append({
            "source_id": source_id, "name": row["competition"],
            "original_clubs": expected_count, "source_status": row["status"],
            "format_provenance": "GENERATED_SIMULATION",
            "expected_regular_games": games,
            "large_schedule_warning": games > 2000,
            "native_status": "NOT_TESTED",
            "official_fidelity": "NOT_CLAIMED"
        })
    if len(documents) != 98 or len(candidates) != 102:
        raise ValueError("Expected exactly 98 simulation documents and 102 candidate entries")
    if len({d["competition_id"] for d in documents}) != 98:
        raise ValueError("Generated format collision")
    return {
        "formats": documents, "catalog": candidates,
        "manifest": {
            "total": 102, "original_playable": 4,
            "generated_simulation_candidates": 98,
            "published_new_competitions": 0,
            "certified_new_competitions": 0,
            "master_sha256_expected": MASTER_SHA,
            "warning": "Do not replace src/data/worlddb-v2/competitions.json before 102 native source, match, market and Save V4 checks.",
            "evidence": evidence
        }
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--matrix", type=Path, default=MATRIX)
    parser.add_argument("--batch", type=Path, default=INDEX)
    parser.add_argument("--published", type=Path, default=PUBLISHED)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    package = build_package(read(args.matrix), read(args.batch), read(args.published))
    args.output.mkdir(parents=True, exist_ok=True)
    for key, filename in [
        ("formats", "simulation-formats.json"),
        ("catalog", "candidate-competitions.json"),
        ("manifest", "manifest.json")
    ]:
        (args.output / filename).write_text(
            json.dumps(package[key], ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    print(json.dumps({
        "candidates": len(package["catalog"]),
        "generated": len(package["formats"]),
        "published": 0,
        "output": str(args.output)
    }))


if __name__ == "__main__":
    main()
