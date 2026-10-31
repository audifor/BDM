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
ADDITIONAL_FORMATS = ROOT / "src/data/worlddb-v2/additional-formats.json"
PGM_FORMATS_DIR = Path(os.environ.get("BDM_PGM_SOURCE", "C:/BDM_DB/PBM_WORLD_EXPERIMENT/pgm-source")) / "reference-packs/competition-formats/seasons"
SOURCE_URL = "https://github.com/audifor/BDM/blob/main/scripts/playable/worlddb-v2-simulation-fallback.py"
MASTER_SHA = "f1624039945c253a6bee2d5c793f58fb753443c5f03b549eba9acd4826dec58f"

NCAA_SOURCE_ID = "pbm:DYN_championnat:71"
NCAA_BUNDLE = ROOT / "src/data/worlddb-v2/competition-runtime.json"


def ncaa_existing_rules_plan(original_clubs, bundle):
    """Reference NCAA rules as actually shipped; never manufacture 353 memberships.

    The 2026-27 format population is not the PBM source cohort. Link explicit
    club-to-conference identities before the college scheduler can be certified.
    """
    docs = bundle["competition_formats"]
    prefix = "competition:USA:ncaa-d1-men:"
    regular = sorted(
        (doc for doc in docs if doc["competition_id"].startswith(prefix)
         and doc["competition_id"].endswith(":regular-season")
         and doc["status"] == "COMPLETE"),
        key=lambda doc: doc["competition_id"],
    )
    tournaments = sorted(
        (doc for doc in docs if doc["competition_id"].startswith(prefix)
         and doc["competition_id"].endswith(":tournament")
         and doc["status"] == "COMPLETE"),
        key=lambda doc: doc["competition_id"],
    )
    final = next((doc for doc in docs
                  if doc["competition_id"] == "competition:USA:ncaa-d1-men-championship"
                  and doc["status"] == "COMPLETE"), None)
    if len(regular) != 32 or len(tournaments) != 32 or final is None:
        raise ValueError("Existing NCAA reference requires 32 conference seasons, 32 conference tournaments and national championship")
    conferences = []
    for doc in regular:
        node = next((node for node in doc["variants"][0]["nodes"]
                     if node["role"] == "REGULAR_SEASON"), None)
        if node is None or not isinstance(node.get("team_count"), int):
            raise ValueError("NCAA reference conference lacks published participant count")
        conference_id = doc["competition_id"].removesuffix(":regular-season")
        matching = next((t for t in tournaments if t["competition_id"] == conference_id + ":tournament"), None)
        if matching is None:
            raise ValueError("NCAA conference tournament missing: " + conference_id)
        conferences.append({
            "reference_competition": conference_id,
            "regular_edition": doc["competition_season_id"],
            "tournament_edition": matching["competition_season_id"],
            "reference_participants": node["team_count"],
            "original_pbm_team_ids": [],
            "membership_status": "UNRECONCILED",
        })
    sum_reference = sum(row["reference_participants"] for row in conferences)
    return {
        "source_competition_id": NCAA_SOURCE_ID,
        "source_clubs": original_clubs,
        "reference_edition": "2026-27",
        "reference_conferences": len(conferences),
        "reference_clubs": sum_reference,
        "reference_difference": sum_reference - original_clubs,
        "existing_calendar_authority": "generateNcaaLikeSchedule",
        "existing_lifecycle_authority": "startNextSeasonTransitionFor",
        "national_championship_format": final["competition_season_id"],
        "conference_formats": conferences,
        "team_membership": "REQUIRES_SOURCE_IDENTITY_RECONCILIATION",
        "scheduling_status": "NOT_CERTIFIED",
        "no_all_team_double_round_robin": True,
        "notes": "353 PBM historical clubs are not the 365 teams in the 2026-27 format references. Do not infer official conference memberships, create 12 phantom teams or schedule 124256 games.",
    }



def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def simulation_document(source_id, name, participants):
    if source_id == NCAA_SOURCE_ID:
        raise ValueError("NCAA D1 must use its existing conference and national championship formats, never global round-robin")
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


def reusable_documented_format(row, participants, documents):
    """Reuse an explicitly mapped, complete, matching format before synthesizing.

    An identity match does not certify its native engine adapter or historical
    edition. Missing/ambiguous documents are a simulation fallback, not a guess.
    """
    reference_id = row.get("native_format_id")
    if not reference_id:
        return None, "NO_MAPPED_FORMAT"
    matches = [doc for doc in documents if doc.get("competition_id") == reference_id]
    valid = []
    for doc in matches:
        if doc.get("status") != "COMPLETE":
            continue
        variants = doc.get("variants", [])
        for variant in variants:
            regular = [node for node in variant.get("nodes", []) if node.get("role") == "REGULAR_SEASON"]
            if len(regular) == 1 and regular[0].get("team_count") == participants:
                valid.append(doc)
                break
    unique = {doc.get("competition_season_id"): doc for doc in valid}
    if len(unique) == 1:
        return next(iter(unique.values())), "COMPLETE_MATCHING_DOCUMENT"
    if len(unique) > 1:
        return None, "AMBIGUOUS_DOCUMENTED_EDITION"
    return None, "DOCUMENTED_REFERENCE_NOT_USABLE"


def load_format_documents(paths):
    """Read known BDM/PGM formats, including the existing PGM seasons directory.

    Read-only input. A collection of edition documents may contain different
    statuses; only one complete format with matching participants is reused.
    """
    documents = []
    for root in paths:
        root = Path(root)
        sources = sorted(root.rglob("*.json")) if root.is_dir() else [root]
        if not sources:
            raise ValueError("Format directory has no JSON documents: " + str(root))
        for path in sources:
            payload = read(path)
            items = (payload if isinstance(payload, list) else
                     payload.get("competition_formats", [payload]) if isinstance(payload, dict) else None)
            if not isinstance(items, list) or any(not isinstance(doc, dict) or
                   not doc.get("competition_id") or not doc.get("competition_season_id")
                   for doc in items):
                raise ValueError("Unsupported documented format source: " + str(path))
            documents.extend(items)
    return documents


def build_package(matrix, batch, published, reusable_formats=()):
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
    reused_documents = []
    evidence = []
    ncaa_plan = None
    reused = 0
    referenced_fallbacks = 0
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
        if source_id == NCAA_SOURCE_ID:
            ncaa_plan = ncaa_existing_rules_plan(expected_count, read(NCAA_BUNDLE))
            candidates.append({
                **config,
                "name": row["competition"],
                "calendar": "NCAA_LIKE_EXISTING_REQUIRES_MEMBERSHIP",
                "nativeStatus": "CANDIDATE_NCAA_MEMBERSHIP_PENDING",
                "formatProvenance": "DOCUMENTED_NCAA_REFERENCE_UNRECONCILED",
            })
            evidence.append({
                "source_id": source_id, "name": row["competition"],
                "original_clubs": expected_count, "source_status": row["status"],
                "format_provenance": "DOCUMENTED_NCAA_REFERENCE_UNRECONCILED",
                "expected_regular_games": None,
                "no_all_team_double_round_robin": True,
                "reference_clubs": ncaa_plan["reference_clubs"],
                "conference_count": ncaa_plan["reference_conferences"],
                "native_status": "NCAA_MEMBERSHIP_PENDING",
                "official_fidelity": "NOT_CERTIFIED",
            })
            continue
        existing_format, reference_resolution = reusable_documented_format(
            row, expected_count, reusable_formats
        )
        reference_id = row.get("native_format_id")
        if existing_format is not None:
            # The document is not cloned and its native competition/edition IDs
            # remain intact. Runtime binding and Windows acceptance are separate.
            reused += 1
            reused_documents.append(existing_format)
            candidates.append({
                **config,
                "nativeCompetitionId": existing_format["competition_id"],
                "editionId": existing_format["competition_season_id"],
                "name": row["competition"],
                "calendar": "DOCUMENTED_FORMAT_ENGINE_BINDING_REQUIRED",
                "nativeStatus": "CANDIDATE_DOCUMENTED_FORMAT_ENGINE_PENDING",
                "formatProvenance": "REUSED_DOCUMENTED_FORMAT",
                "formatReferenceId": existing_format["competition_id"],
                "formatReferenceResolution": reference_resolution,
            })
            evidence.append({
                "source_id": source_id, "name": row["competition"],
                "original_clubs": expected_count, "source_status": row["status"],
                "format_provenance": "REUSED_DOCUMENTED_FORMAT",
                "format_reference_id": existing_format["competition_id"],
                "format_reference_edition": existing_format["competition_season_id"],
                "expected_regular_games": None,
                "native_status": "ENGINE_BINDING_PENDING",
                "official_fidelity": "EDITION_AND_NATIVE_ACCEPTANCE_PENDING",
            })
            continue
        if reference_id:
            referenced_fallbacks += 1
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
            "formatProvenance": "GENERATED_SIMULATION",
            **({"formatReferenceId": reference_id,
                "formatReferenceResolution": reference_resolution} if reference_id else {}),
        })
        games = expected_count * (expected_count - 1)
        evidence.append({
            "source_id": source_id, "name": row["competition"],
            "original_clubs": expected_count, "source_status": row["status"],
            "format_provenance": "GENERATED_SIMULATION",
            **({"format_reference_id": reference_id,
                "format_reference_resolution": reference_resolution} if reference_id else {}),
            "expected_regular_games": games,
            "large_schedule_warning": games > 2000,
            "native_status": "NOT_TESTED",
            "official_fidelity": "NOT_CLAIMED"
        })
    expected_new = 102 - len(existing) - 1
    if len(documents) + reused != expected_new or len(candidates) != 102 or ncaa_plan is None:
        raise ValueError("Expected 102 identities: originals, reused formats, generated formats and NCAA")
    if len({d["competition_id"] for d in documents}) != len(documents):
        raise ValueError("Generated format collision")
    return {
        "formats": documents, "reused_formats": reused_documents,
        "catalog": candidates, "ncaa_plan": ncaa_plan,
        "manifest": {
            "total": 102, "original_playable": 4,
            "generated_simulation_candidates": len(documents),
            "reused_documented_format_candidates": reused,
            "generated_with_documented_reference": referenced_fallbacks,
            "ncaa_existing_rules_pending_membership": 1,
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
    parser.add_argument("--format-source", action="append", type=Path, default=[],
                        help="Additional read-only PGM/B04 format JSON file or directory; repeatable")
    parser.add_argument("--pgm-formats-dir", type=Path, default=PGM_FORMATS_DIR,
                        help="Existing PGM seasons reference-pack directory, imported read-only if present")
    args = parser.parse_args()
    # Reuse the PGM reference packs already on the developer's disk. Missing
    # optional private sources never prevent the checked-in bundle from working.
    sources = [NCAA_BUNDLE, ADDITIONAL_FORMATS]
    if args.pgm_formats_dir.is_dir():
        sources.append(args.pgm_formats_dir)
    documented = load_format_documents([*sources, *args.format_source])
    package = build_package(read(args.matrix), read(args.batch), read(args.published),
                            reusable_formats=documented)
    args.output.mkdir(parents=True, exist_ok=True)
    for key, filename in [
        ("formats", "simulation-formats.json"),
        ("reused_formats", "reused-documented-formats.json"),
        ("catalog", "candidate-competitions.json"),
        ("ncaa_plan", "ncaa-existing-rules-plan.json"),
        ("manifest", "manifest.json")
    ]:
        (args.output / filename).write_text(
            json.dumps(package[key], ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    print(json.dumps({
        "candidates": len(package["catalog"]),
        "generated": len(package["formats"]),
        "reused": package["manifest"]["reused_documented_format_candidates"],
        "published": 0,
        "output": str(args.output)
    }))


if __name__ == "__main__":
    main()
