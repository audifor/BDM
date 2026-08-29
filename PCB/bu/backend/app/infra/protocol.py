from __future__ import annotations

import json
import sys
from typing import Dict, Iterable, Optional, TextIO


class ProtocolError(Exception):
    pass


def read_messages(stream: TextIO) -> Iterable[Dict]:
    for line in stream:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ProtocolError(f"Invalid JSON: {exc}") from exc
        if not isinstance(msg, dict):
            raise ProtocolError("Message must be a JSON object")
        yield msg


def write_response(resp: Dict, stream: Optional[TextIO] = None) -> None:
    if stream is None:
        stream = sys.stdout
    stream.write(json.dumps(resp, ensure_ascii=True))
    stream.write("\n")
    stream.flush()
