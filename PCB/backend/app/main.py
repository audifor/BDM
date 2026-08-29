from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict

# Ensure package imports work when running as a script
if __package__ in (None, ""):
    sys.path.append(str(Path(__file__).resolve().parents[2]))

from backend.app.api.commands import UnknownCommand, dispatch
from backend.app.infra.db import connect, init_schema
from backend.app.infra.logging import setup_logging
from backend.app.infra.paths import DEFAULT_DB, ensure_dirs
from backend.app.infra.seed import seed_demo_players
from backend.app.services import savegame_service


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="PCBasket Engine")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to sqlite file")
    parser.add_argument("--init-db", action="store_true", help="Create schema if missing")
    parser.add_argument("--seed", action="store_true", help="Seed demo data")
    return parser.parse_args()


def respond(request_id: str | None, ok: bool, result: Any = None, code: str = "", message: str = "") -> Dict[str, Any]:
    if ok:
        return {"request_id": request_id, "ok": True, "result": result}
    return {"request_id": request_id, "ok": False, "error": {"code": code, "message": message}}


def main() -> int:
    args = parse_args()
    logger = setup_logging()
    ensure_dirs()

    db_path = Path(args.db)
    conn = connect(db_path=db_path)
    # Always apply migrations; they are idempotent and tracked.
    init_schema(conn)
    # Ensure savegame metadata exists for this DB
    savegame_service.ensure_savegame(conn, db_path=db_path)
    if args.seed:
        seed_demo_players(conn)

    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        request_id = None
        try:
            msg = json.loads(line)
            if not isinstance(msg, dict):
                raise ValueError("Message must be a JSON object")
            request_id = msg.get("request_id")
            command = msg.get("command")
            payload = msg.get("payload") or {}
            if not command:
                raise ValueError("Missing command")
            result = dispatch(command, payload, conn)
            sys.stdout.write(json.dumps(respond(request_id, True, result), ensure_ascii=True))
            sys.stdout.write("\n")
            sys.stdout.flush()
        except UnknownCommand as exc:
            logger.info("Unknown command: %s", exc)
            sys.stdout.write(json.dumps(respond(request_id, False, code="UNKNOWN_COMMAND", message=str(exc)), ensure_ascii=True))
            sys.stdout.write("\n")
            sys.stdout.flush()
        except Exception as exc:  # keep engine alive
            logger.exception("Error handling request")
            sys.stdout.write(json.dumps(respond(request_id, False, code="ERROR", message=str(exc)), ensure_ascii=True))
            sys.stdout.write("\n")
            sys.stdout.flush()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
