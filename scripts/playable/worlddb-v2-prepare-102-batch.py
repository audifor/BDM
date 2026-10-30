"""Stage the certified PBM V2-04 batch for 102-format integration without copying
or overwriting the original SQLite databases and 102 cached snapshots.

The output remains ignored under this checkout's .worlddb-v2 directory.
No master data, Runtime files, public catalog or sources are modified.
"""
import argparse
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = Path("C:/BDM-worktrees/worlddb-v2-04/.worlddb-v2/batch-04/index.json")
TARGET = ROOT / ".worlddb-v2/batch-04/index.json"
EXPECTED_SHA = "f1624039945c253a6bee2d5c793f58fb753443c5f03b549eba9acd4826dec58f"


def stage_index(source_path: Path, target_path: Path) -> dict:
    source_path = source_path.resolve()
    target_path = target_path.resolve()
    if source_path == target_path:
        raise ValueError("Source and destination must be separate; preserve original V2-04 evidence")
    index = json.loads(source_path.read_text(encoding="utf-8-sig"))
    rows = index.get("results", [])
    if index.get("total") != 102 or len(rows) != 102:
        raise ValueError("Expected complete 102-row PBM V2-04 evidence")
    if index.get("master_sha256") != EXPECTED_SHA or not index.get("master_intact"):
        raise ValueError("V2-04 evidence does not certify expected immutable WorldDB V2 master")
    names = [row["source_id"] for row in rows]
    if len(set(names)) != 102:
        raise ValueError("Duplicate PBM competition identities")
    source_root = source_path.parent.parent.parent
    staged = copy.deepcopy(index)
    for row in staged["results"]:
        if row.get("source_build") != "PASS" or not row.get("original_club_ids_preserved"):
            raise ValueError("Original PBM source build not certified: " + row["source_id"])
        snapshot = Path(row.get("snapshotPath", ""))
        if not snapshot.is_absolute():
            snapshot = source_root / snapshot
        snapshot = snapshot.resolve()
        if not snapshot.is_file():
            raise FileNotFoundError("Missing original, read-only source snapshot: " + str(snapshot))
        row["snapshotPath"] = str(snapshot)
    staged["integration_source_index"] = str(source_path)
    staged["integration_source_unchanged"] = True
    target_path.parent.mkdir(parents=True, exist_ok=True)
    if target_path.exists():
        raise FileExistsError("Integration index already exists; do not overwrite a running/resumable batch: " + str(target_path))
    target_path.write_text(json.dumps(staged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"total": 102, "master_sha256": EXPECTED_SHA, "staged": str(target_path), "original": str(source_path)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-index", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--destination", type=Path, default=TARGET)
    args = parser.parse_args()
    print(json.dumps(stage_index(args.source_index, args.destination), ensure_ascii=False))


if __name__ == "__main__":
    main()
