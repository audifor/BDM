"""Bind actual PBM NCAA club IDs to existing NCAA conference formats.

Input contains explicit sourced memberships, never a seed-based allocation.
A 353-club PBM edition must not silently inherit all 365 2026-27 entries.

Example (private files not committed):
python -B scripts/playable/worlddb-v2-ncaa-bindings.py \
  --snapshot .worlddb-v2/batch-04/DYN_championnat-71/snapshot.json \
  --plan .worlddb-v2/generated-simulation-candidates/ncaa-existing-rules-plan.json \
  --memberships .worlddb-v2/ncaa/pbm-conference-memberships.json \
  --output .worlddb-v2/ncaa/validated-conference-memberships.json
"""
import argparse
import json
from collections import Counter
from pathlib import Path

NCAA = "pbm:DYN_championnat:71"


def bind_ncaa(snapshot, plan, memberships):
    if plan.get("source_competition_id") != NCAA:
        raise ValueError("Not the PBM NCAA I source selection")
    if {row["entity_id"] for row in snapshot.get("competitions", [])} != {NCAA}:
        raise ValueError("NCAA snapshot selection mismatch")
    club_ids = [row["entity_id"] for row in snapshot["clubs"]]
    if len(club_ids) != 353 or len(set(club_ids)) != 353:
        raise ValueError("Expected 353 unique original PBM NCAA programs")
    if any(not club.startswith("pbm:DYN_equipe:") for club in club_ids):
        raise ValueError("An NCAA program lost its original PBM identity")
    if plan.get("source_clubs") != 353 or plan.get("reference_conferences") != 32:
        raise ValueError("NCAA reference plan mismatch")
    if plan.get("reference_clubs") != 365:
        raise ValueError("2026-27 NCAA reference changed; compare editions before proceeding")
    if memberships.get("source_competition_id") != NCAA:
        raise ValueError("Conference memberships refer to another competition")
    if memberships.get("master_sha256") != snapshot["manifest"]["master"]["sha256"]:
        raise ValueError("NCAA membership source identity does not match original master")
    edition = plan.get("reference_edition")
    if not edition or memberships.get("membership_edition") != edition:
        raise ValueError("NCAA membership edition must match the reference edition")
    allowed = {row["reference_competition"] for row in plan["conference_formats"]}
    if len(allowed) != 32:
        raise ValueError("NCAA format catalog must provide 32 unique conference identities")
    assignments = memberships.get("assignments", [])
    if len(assignments) != 353:
        raise ValueError("A complete NCAA binding requires one assignment for each of the 353 clubs")
    assigned_ids = [record["teamId"] for record in assignments]
    if len(set(assigned_ids)) != len(assigned_ids) or set(assigned_ids) != set(club_ids):
        raise ValueError("NCAA club-to-conference assignments duplicate or omit original PBM programs")
    for record in assignments:
        if record.get("conferenceCompetitionId") not in allowed:
            raise ValueError("Unknown NCAA conference identity: " + str(record.get("conferenceCompetitionId")))
        if not record.get("evidence"):
            raise ValueError("Every NCAA membership must have explicit source evidence")
        if record.get("edition") != edition:
            raise ValueError("Every NCAA membership must be evidenced for the reference edition")
    sizes = Counter(record["conferenceCompetitionId"] for record in assignments)
    if len(sizes) != 32 or min(sizes.values()) < 2:
        raise ValueError("NCAA schedule requires 32 populated conferences with at least two clubs")
    return {
        "source_competition_id": NCAA,
        "master_sha256": memberships["master_sha256"],
        "source_clubs": 353,
        "reference_clubs": 365,
        "reference_conferences": 32,
        "edition_fidelity": "MEMBERSHIPS_EVIDENCED_FOR_REFERENCE_EDITION_POPULATION_DIFFERENCE_UNVERIFIED",
        "membership_provenance": "EXPLICIT_SOURCE_REFERENCES",
        "native_calendar": "generateNcaaLikeSchedule",
        "native_lifecycle": "startNextSeasonTransitionFor",
        "status": "IDENTITIES_LINKED_SPORTING_ACCEPTANCE_PENDING",
        "assignments": sorted(assignments, key=lambda row: row["teamId"]),
        "conference_sizes": dict(sorted(sizes.items())),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--memberships", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = [json.loads(path.read_text(encoding="utf-8-sig"))
              for path in (args.snapshot, args.plan, args.memberships)]
    result = bind_ncaa(*source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.exists():
        raise FileExistsError("Existing NCAA binding cannot be overwritten without independent inspection")
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k not in ("assignments", "conference_sizes")}))


if __name__ == "__main__":
    main()
