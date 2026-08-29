"""Market system service - Shortlist, Negotiations, Agencies, Intelligence."""

from __future__ import annotations

import json
import random
import sqlite3
import time
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from ..domain.contract_catalogs import load_contract_bonuses, load_contract_clauses
from ..repo import contract_repo, gm_repo
from ..services.contract_factory import apply_contract_type, create_contract_data
from ..services.rules_service import snapshot as rules_snapshot
from ..services import gm_service, smartphone_service


# ============================================================================
# SHORTLIST MANAGEMENT
# ============================================================================

MAX_OFFER_ATTEMPTS = 3

MARKET_VALUE_BUCKETS = {2: 250_000, 3: 500_000, 4: 1_000_000, 5: 1_500_000, 6: 2_000_000}


def _parse_iso_date(value: str | None) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except Exception:
        return None


def _get_team(conn: sqlite3.Connection, team_id: int) -> Optional[Dict[str, Any]]:
    row = conn.execute("SELECT id, data_json FROM team WHERE id = ?", (int(team_id),)).fetchone()
    if not row:
        return None
    return {"id": int(row["id"]), "data": json.loads(row["data_json"]) if row["data_json"] else {}}


def _get_player(conn: sqlite3.Connection, player_id: int) -> Optional[Dict[str, Any]]:
    row = conn.execute("SELECT id, name, data_json FROM player WHERE id = ?", (int(player_id),)).fetchone()
    if not row:
        return None
    return {"id": int(row["id"]), "name": row["name"], "data": json.loads(row["data_json"]) if row["data_json"] else {}}


def _is_scholarship_player(player_data: Dict[str, Any]) -> bool:
    contract_type = str(player_data.get("contract_type") or "").lower()
    if contract_type in {"scholarship", "beca", "non_pro", "non-pro", "amateur"}:
        return True
    if player_data.get("is_scholarship") is True:
        return True
    age = (player_data.get("bio") or {}).get("age")
    try:
        age = int(age)
    except (TypeError, ValueError):
        return False
    return age < 18


def _is_ncaa_league(league_id: str | None) -> bool:
    return str(league_id or "").upper().startswith("NCAA")


def _league_universe(league_id: str) -> str:
    league_id = str(league_id or "").upper()
    mapping = {
        "ACB": "FIBA",
        "FEB": "FIBA",
        "NBA": "NBA",
        "WNBA": "WNBA",
        "NCAA_M": "NCAA",
        "NCAA_W": "NCAA",
    }
    return mapping.get(league_id, "FIBA")


def _find_league_rules(league_id: str) -> Dict[str, Any]:
    catalog = rules_snapshot()
    for league in catalog.get("leagues") or []:
        if str(league.get("id") or "").upper() == str(league_id or "").upper():
            return league.get("rules") or {}
    return {}


def _market_windows_for(rules: Dict[str, Any], action_type: str, scope: str) -> List[Dict[str, Any]]:
    market = rules.get("market") or {}
    windows = market.get("windows") or []
    matches = []
    for window in windows:
        w_type = str(window.get("type") or "").lower()
        w_scope = str(window.get("scope") or "").lower()
        if w_type and w_type != action_type:
            continue
        if w_scope and w_scope not in {scope, "all"}:
            continue
        matches.append(window)
    return matches


def _is_market_open(rules: Dict[str, Any], action_type: str, scope: str, current: date) -> bool:
    windows = _market_windows_for(rules, action_type, scope)
    if not windows:
        return True
    for window in windows:
        start = _parse_iso_date(str(window.get("start") or "")) or current
        end = _parse_iso_date(str(window.get("end") or "")) or current
        if start <= current <= end:
            return True
    return False


def _validate_contract_items(clauses: List[str], bonuses: List[str], universe: str) -> Tuple[bool, List[str]]:
    allowed_clauses = set(load_contract_clauses(universe))
    allowed_bonuses = set(load_contract_bonuses(universe))
    invalid = []
    for clause in clauses or []:
        if clause not in allowed_clauses:
            invalid.append(f"clause:{clause}")
    for bonus in bonuses or []:
        if bonus not in allowed_bonuses:
            invalid.append(f"bonus:{bonus}")
    return (len(invalid) == 0, invalid)


def _expected_wage(market_value: int, league_id: str) -> int:
    if market_value <= 0:
        return 60_000
    league_id = str(league_id or "").upper()
    if league_id == "NBA":
        return max(200_000, int(market_value / 8))
    if league_id == "WNBA":
        return max(40_000, int(market_value / 14))
    if league_id.startswith("NCAA"):
        return 0
    return max(60_000, int(market_value / 12))


def _update_team_budget(conn: sqlite3.Connection, team_id: int, delta: int) -> int:
    row = conn.execute("SELECT data_json FROM team WHERE id = ?", (int(team_id),)).fetchone()
    if not row:
        return 0
    data = json.loads(row["data_json"]) if row["data_json"] else {}
    budget = int(data.get("budget") or 0)
    budget = int(budget + int(delta))
    data["budget"] = budget
    conn.execute(
        "UPDATE team SET data_json = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), int(team_id)),
    )
    conn.commit()
    return budget


def _sanitize_offer_for_scholarship(
    offer_details: Dict[str, Any],
    enforce: bool = True,
) -> Tuple[Dict[str, Any], List[str]]:
    warnings: List[str] = []
    cleaned = dict(offer_details or {})
    if cleaned.get("fee"):
        warnings.append("fee_for_scholarship")
        cleaned["fee"] = 0
    if cleaned.get("wage"):
        warnings.append("wage_for_scholarship")
        cleaned["wage"] = 0
    if cleaned.get("clauses"):
        warnings.append("clauses_for_scholarship")
        cleaned["clauses"] = []
    if cleaned.get("bonuses"):
        warnings.append("bonuses_for_scholarship")
        cleaned["bonuses"] = []
    if enforce:
        cleaned["contract_years"] = max(1, int(cleaned.get("contract_years") or 1))
    return cleaned, warnings


def _validate_budget(team_data: Dict[str, Any], fee: int) -> Optional[str]:
    budget = int(team_data.get("budget") or 0)
    if fee > budget:
        return "Insufficient budget for transfer fee"
    return None


def _append_transfer_history(conn: sqlite3.Connection, team_id: int, transfer: Dict[str, Any]) -> None:
    team = conn.execute("SELECT data_json FROM team WHERE id = ?", (team_id,)).fetchone()
    if not team:
        return
    data = json.loads(team["data_json"])
    history = data.get("transfer_history", [])
    history.append(transfer)
    data["transfer_history"] = history
    conn.execute(
        "UPDATE team SET data_json = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), team_id),
    )
    conn.commit()


def _log_market_event(
    conn: sqlite3.Connection,
    team_id: int,
    title: str,
    body: str,
    current_date: date,
    event_type: str = "market",
    severity: str = "info",
) -> None:
    try:
        gm_service._ensure_tables(conn)
        event = gm_repo.create_event(
            conn,
            team_id=int(team_id),
            event_type=event_type,
            severity=severity,
            state="open",
            title=title,
            body=body,
            event_date=current_date.isoformat(),
            data={"origin": "market"},
        )
        smartphone_service.create_content(
            conn,
            {
                "team_id": int(team_id),
                "content_type": "news",
                "data": {
                    "title": title,
                    "content": body,
                    "timestamp": current_date.isoformat(),
                    "type": "market",
                    "event_id": event.get("id"),
                },
            },
        )
    except Exception:
        return

def add_to_shortlist(
    conn: sqlite3.Connection,
    team_id: int,
    player_id: int,
    priority: str = "medium",
    notes: str = "",
) -> Dict[str, Any]:
    """Add player to team's shortlist."""
    team = conn.execute("SELECT data_json FROM team WHERE id = ?", (team_id,)).fetchone()
    if not team:
        return {"ok": False, "error": "Team not found"}

    data = json.loads(team["data_json"])
    shortlist = data.get("shortlist", [])

    # Check if already in shortlist
    if any(item["player_id"] == player_id for item in shortlist):
        return {"ok": False, "error": "Player already in shortlist"}

    # Generate unique ID
    item_id = f"short_{int(time.time())}_{player_id}"

    new_item = {
        "id": item_id,
        "player_id": player_id,
        "priority": priority,  # high | medium | low
        "status": "watching",  # watching | negotiating | agreed | rejected
        "notes": notes,
        "added_at": int(time.time()),
        "alerts": [],
    }

    shortlist.append(new_item)
    data["shortlist"] = shortlist

    conn.execute(
        "UPDATE team SET data_json = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), team_id),
    )
    conn.commit()

    return {"ok": True, "item": new_item}


def remove_from_shortlist(
    conn: sqlite3.Connection,
    team_id: int,
    player_id: int,
) -> Dict[str, Any]:
    """Remove player from shortlist."""
    team = conn.execute("SELECT data_json FROM team WHERE id = ?", (team_id,)).fetchone()
    if not team:
        return {"ok": False, "error": "Team not found"}

    data = json.loads(team["data_json"])
    shortlist = data.get("shortlist", [])

    initial_count = len(shortlist)
    shortlist = [item for item in shortlist if item["player_id"] != player_id]

    if len(shortlist) == initial_count:
        return {"ok": False, "error": "Player not in shortlist"}

    data["shortlist"] = shortlist

    conn.execute(
        "UPDATE team SET data_json = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), team_id),
    )
    conn.commit()

    return {"ok": True}


def update_shortlist_item(
    conn: sqlite3.Connection,
    team_id: int,
    player_id: int,
    updates: Dict[str, Any],
) -> Dict[str, Any]:
    """Update a shortlist item (priority, status, notes)."""
    team = conn.execute("SELECT data_json FROM team WHERE id = ?", (team_id,)).fetchone()
    if not team:
        return {"ok": False, "error": "Team not found"}

    data = json.loads(team["data_json"])
    shortlist = data.get("shortlist", [])

    item = next((i for i in shortlist if i["player_id"] == player_id), None)
    if not item:
        return {"ok": False, "error": "Player not in shortlist"}

    # Update allowed fields
    if "priority" in updates:
        item["priority"] = updates["priority"]
    if "status" in updates:
        item["status"] = updates["status"]
    if "notes" in updates:
        item["notes"] = updates["notes"]
    if "alerts" in updates:
        item["alerts"] = updates["alerts"]

    data["shortlist"] = shortlist

    conn.execute(
        "UPDATE team SET data_json = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), team_id),
    )
    conn.commit()

    return {"ok": True, "item": item}


# ============================================================================
# NEGOTIATIONS
# ============================================================================

def make_offer(
    conn: sqlite3.Connection,
    team_id: int,
    player_id: int,
    offer_details: Dict[str, Any],
) -> Dict[str, Any]:
    """Make a transfer offer for a player."""
    if not isinstance(offer_details, dict):
        offer_details = {}
    team = conn.execute("SELECT data_json FROM team WHERE id = ?", (team_id,)).fetchone()
    if not team:
        return {"ok": False, "error": "Team not found"}

    player = conn.execute("SELECT id, name, data_json FROM player WHERE id = ?", (player_id,)).fetchone()
    if not player:
        return {"ok": False, "error": "Player not found"}

    data = json.loads(team["data_json"])
    negotiations = data.get("active_negotiations", [])
    offer_attempts = data.get("offer_attempts", {})

    # Check if already negotiating
    existing = next((n for n in negotiations if n["player_id"] == player_id and n["type"] == "outgoing"), None)
    if existing:
        return {"ok": False, "error": "Already negotiating for this player"}

    attempt_key = str(player_id)
    attempts = int(offer_attempts.get(attempt_key, 0))
    if attempts >= MAX_OFFER_ATTEMPTS:
        return {"ok": False, "error": "Offer attempt limit reached"}

    team_data = json.loads(team["data_json"])
    league_id = team_data.get("league_id") or team_data.get("league") or team_data.get("leagueId") or "ACB"
    league_rules = _find_league_rules(league_id)

    current_date = _parse_iso_date(str(offer_details.get("current_date") or "")) or date.today()
    player_data = json.loads(player["data_json"]) if player["data_json"] else {}
    is_scholarship = _is_scholarship_player(player_data) or _is_ncaa_league(league_id)
    player_team_id = player_data.get("team_id")
    scope = "external"
    if player_team_id:
        player_team = _get_team(conn, int(player_team_id))
        player_league = (player_team or {}).get("data", {}).get("league_id") if player_team else None
        if player_league and str(player_league).upper() == str(league_id).upper():
            scope = "domestic"
    if not _is_market_open(league_rules, "transfer", scope, current_date):
        return {"ok": False, "error": "Market window closed"}

    warnings: List[str] = []
    if is_scholarship:
        offer_details, warnings = _sanitize_offer_for_scholarship(offer_details)
    clauses = offer_details.get("clauses", []) or []
    bonuses = offer_details.get("bonuses", []) or []
    offer_wage = 0 if is_scholarship else offer_details.get("wage", 0)
    offer_fee = int(offer_details.get("fee") or 0)
    if offer_fee < 0:
        offer_fee = 0
    budget_error = _validate_budget(team_data, offer_fee)
    if budget_error:
        return {"ok": False, "error": budget_error}
    universe = _league_universe(league_id)
    valid_items, invalid = _validate_contract_items(clauses, bonuses, universe)
    if not valid_items:
        return {"ok": False, "error": "Invalid contract items", "invalid": invalid}

    # Create negotiation
    neg_id = f"neg_{int(time.time())}_{player_id}"
    # FM-like: the club/agent should respond quickly; use a short response window.
    deadline_date = current_date + timedelta(days=1)
    contract_years = max(1, int(offer_details.get("contract_years") or 1))
    playing_time = str(offer_details.get("playing_time") or offer_details.get("playingTime") or "")
    promises = offer_details.get("promises") or []
    if not isinstance(promises, list):
        promises = []
    negotiation = {
        "id": neg_id,
        "player_id": player_id,
        "type": "outgoing",
        "status": "pending",  # pending | club_accepted | player_rejected | negotiating_wage | agreed | rejected
        "phase": "club",
        "created_date": current_date.isoformat(),
        "current_offer": {
            "fee": offer_fee,
            "wage": offer_wage,
            "contract_years": contract_years,
            "playing_time": playing_time,
            "promises": promises,
            "clauses": clauses,
            "bonuses": bonuses,
        },
        "counter_offer": None,
        "counter_rounds": 0,
        "locks": {
            "fee": False,
            "wage": False,
            "contract_years": False,
            "playing_time": False,
            "promises": False,
            "clauses": False,
            "bonuses": False,
        },
        "tension": 0,
        "messages": [
            {
                "date": current_date.isoformat(),
                "from": "you",
                "tone": "neutral",
                "text": "Has enviado una oferta inicial.",
            }
        ],
        "attempts": attempts + 1,
        "attempt_limit": MAX_OFFER_ATTEMPTS,
        "history": [
            {
                "timestamp": int(time.time()),
                "description": "Oferta inicial realizada",
                "offer": {**offer_details, "wage": offer_wage, "fee": offer_fee, "contract_years": contract_years},
            }
        ],
        "deadline_date": deadline_date.isoformat(),
        "deadline": int(time.time()) + (7 * 24 * 60 * 60),  # legacy timestamp
    }

    negotiations.append(negotiation)
    data["active_negotiations"] = negotiations
    offer_attempts[attempt_key] = attempts + 1
    data["offer_attempts"] = offer_attempts

    conn.execute(
        "UPDATE team SET data_json = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), team_id),
    )
    conn.commit()

    return {"ok": True, "negotiation": negotiation, "warnings": warnings}


def improve_offer(
    conn: sqlite3.Connection,
    team_id: int,
    negotiation_id: str,
    new_offer: Dict[str, Any],
) -> Dict[str, Any]:
    """Improve an existing offer."""
    team = conn.execute("SELECT data_json FROM team WHERE id = ?", (team_id,)).fetchone()
    if not team:
        return {"ok": False, "error": "Team not found"}

    data = json.loads(team["data_json"])
    negotiations = data.get("active_negotiations", [])

    neg = next((n for n in negotiations if n["id"] == negotiation_id), None)
    if not neg:
        return {"ok": False, "error": "Negotiation not found"}

    league_id = data.get("league_id") or data.get("league") or data.get("leagueId") or "ACB"
    player_id = neg.get("player_id")
    player_data: Dict[str, Any] = {}
    if player_id:
        player_row = _get_player(conn, int(player_id))
        if player_row:
            player_data = player_row.get("data") or {}
    is_scholarship = _is_scholarship_player(player_data) or _is_ncaa_league(league_id)
    universe = _league_universe(league_id)
    if not isinstance(new_offer, dict):
        new_offer = {}
    current_date = _parse_iso_date(str(new_offer.get("current_date") or "")) or date.today()
    if is_scholarship:
        new_offer, _ = _sanitize_offer_for_scholarship(new_offer)
    clauses = new_offer.get("clauses", neg["current_offer"].get("clauses", [])) or []
    bonuses = new_offer.get("bonuses", neg["current_offer"].get("bonuses", [])) or []
    offer_wage = 0 if is_scholarship else new_offer.get("wage", neg["current_offer"]["wage"])
    valid_items, invalid = _validate_contract_items(clauses, bonuses, universe)
    if not valid_items:
        return {"ok": False, "error": "Invalid contract items", "invalid": invalid}

    current_fee = int(neg["current_offer"].get("fee") or 0)
    next_fee = int(new_offer.get("fee", current_fee))
    if not new_offer:
        # Auto-bump when no offer details provided
        next_fee = int(current_fee * 1.08) if current_fee > 0 else 0
        if not is_scholarship:
            offer_wage = int(offer_wage * 1.06) if offer_wage else offer_wage
    if next_fee < 0:
        next_fee = 0
    budget_error = _validate_budget(data, next_fee)
    if budget_error:
        return {"ok": False, "error": budget_error}

    contract_years = max(1, int(new_offer.get("contract_years", neg["current_offer"]["contract_years"]) or 1))
    playing_time = str(new_offer.get("playing_time") or new_offer.get("playingTime") or neg["current_offer"].get("playing_time") or "")
    promises = new_offer.get("promises", neg["current_offer"].get("promises", [])) or []
    if not isinstance(promises, list):
        promises = []
    # Update offer
    neg["current_offer"] = {
        "fee": next_fee,
        "wage": offer_wage,
        "contract_years": contract_years,
        "playing_time": playing_time,
        "promises": promises,
        "clauses": clauses,
        "bonuses": bonuses,
    }
    neg["counter_offer"] = None
    neg["counter_rounds"] = 0
    if str(neg.get("status") or "") == "pending":
        neg["phase"] = "club"
        neg["deadline_date"] = (current_date + timedelta(days=3)).isoformat()
    elif str(neg.get("status") or "") == "negotiating_wage":
        neg["phase"] = "agent"
        neg["deadline_date"] = (current_date + timedelta(days=3)).isoformat()
    neg.setdefault("messages", []).append(
        {
            "date": current_date.isoformat(),
            "from": "you",
            "tone": "neutral",
            "text": "Has mejorado la oferta.",
        }
    )

    # Add to history
    neg["history"].append({
        "timestamp": int(time.time()),
        "description": "Oferta mejorada",
        "offer": {**neg["current_offer"], "wage": offer_wage},
    })

    data["active_negotiations"] = negotiations

    conn.execute(
        "UPDATE team SET data_json = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), team_id),
    )
    conn.commit()

    return {"ok": True, "negotiation": neg}


def withdraw_offer(
    conn: sqlite3.Connection,
    team_id: int,
    negotiation_id: str,
) -> Dict[str, Any]:
    """Withdraw a transfer offer."""
    team = conn.execute("SELECT data_json FROM team WHERE id = ?", (team_id,)).fetchone()
    if not team:
        return {"ok": False, "error": "Team not found"}

    data = json.loads(team["data_json"])
    negotiations = data.get("active_negotiations", [])

    initial_count = len(negotiations)
    negotiations = [n for n in negotiations if n["id"] != negotiation_id]

    if len(negotiations) == initial_count:
        return {"ok": False, "error": "Negotiation not found"}

    data["active_negotiations"] = negotiations

    conn.execute(
        "UPDATE team SET data_json = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), team_id),
    )
    conn.commit()

    return {"ok": True}


def respond_to_offer(
    conn: sqlite3.Connection,
    team_id: int,
    negotiation_id: str,
    response: str,  # accept | reject
) -> Dict[str, Any]:
    """Respond to an incoming offer."""
    team = conn.execute("SELECT data_json FROM team WHERE id = ?", (team_id,)).fetchone()
    if not team:
        return {"ok": False, "error": "Team not found"}

    data = json.loads(team["data_json"])
    negotiations = data.get("active_negotiations", [])

    neg = next((n for n in negotiations if n["id"] == negotiation_id and n["type"] == "incoming"), None)
    if not neg:
        return {"ok": False, "error": "Negotiation not found or not incoming"}

    if response == "accept":
        neg["status"] = "agreed"
        neg["history"].append({
            "timestamp": int(time.time()),
            "description": "Oferta aceptada",
        })
    elif response == "reject":
        neg["status"] = "rejected"
        neg["history"].append({
            "timestamp": int(time.time()),
            "description": "Oferta rechazada",
        })

    data["active_negotiations"] = negotiations

    conn.execute(
        "UPDATE team SET data_json = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), team_id),
    )
    conn.commit()

    return {"ok": True, "negotiation": neg}


# ============================================================================
# AGENCY RELATIONSHIPS
# ============================================================================

def update_agency_relationship(
    conn: sqlite3.Connection,
    team_id: int,
    agency_id: str,
    delta: int,
) -> Dict[str, Any]:
    """Update relationship with an agency."""
    team = conn.execute("SELECT data_json FROM team WHERE id = ?", (team_id,)).fetchone()
    if not team:
        return {"ok": False, "error": "Team not found"}

    data = json.loads(team["data_json"])
    relationships = data.get("agency_relationships", {})

    if agency_id not in relationships:
        relationships[agency_id] = {
            "relationship": 0,
            "last_deal": None,
            "deals_count": 0,
        }

    relationships[agency_id]["relationship"] = max(-100, min(100, relationships[agency_id]["relationship"] + delta))
    data["agency_relationships"] = relationships

    conn.execute(
        "UPDATE team SET data_json = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), team_id),
    )
    conn.commit()

    return {"ok": True, "relationship": relationships[agency_id]}


def record_agency_deal(
    conn: sqlite3.Connection,
    team_id: int,
    agency_id: str,
) -> Dict[str, Any]:
    """Record a completed deal with an agency."""
    team = conn.execute("SELECT data_json FROM team WHERE id = ?", (team_id,)).fetchone()
    if not team:
        return {"ok": False, "error": "Team not found"}

    data = json.loads(team["data_json"])
    relationships = data.get("agency_relationships", {})

    if agency_id not in relationships:
        relationships[agency_id] = {
            "relationship": 0,
            "last_deal": None,
            "deals_count": 0,
        }

    relationships[agency_id]["deals_count"] += 1
    relationships[agency_id]["last_deal"] = int(time.time())

    # Improve relationship
    improvement = random.randint(5, 15)
    relationships[agency_id]["relationship"] = min(100, relationships[agency_id]["relationship"] + improvement)

    data["agency_relationships"] = relationships

    conn.execute(
        "UPDATE team SET data_json = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), team_id),
    )
    conn.commit()

    return {"ok": True, "relationship": relationships[agency_id]}


def get_agency_discount(
    conn: sqlite3.Connection,
    team_id: int,
    agency_id: str,
) -> float:
    """Calculate commission discount based on relationship."""
    team = conn.execute("SELECT data_json FROM team WHERE id = ?", (team_id,)).fetchone()
    if not team:
        return 0.0

    data = json.loads(team["data_json"])
    relationships = data.get("agency_relationships", {})

    if agency_id not in relationships:
        return 0.0

    relationship = relationships[agency_id]["relationship"]

    if relationship >= 80:
        return 0.20
    elif relationship >= 60:
        return 0.15
    elif relationship >= 40:
        return 0.10
    elif relationship >= 20:
        return 0.05
    else:
        return 0.0


# ============================================================================
# MARKET INTELLIGENCE
# ============================================================================

def get_market_stats(
    conn: sqlite3.Connection,
    filters: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Get market statistics with optional filters."""
    query = "SELECT data_json FROM player"
    params = []

    # Apply filters if provided
    if filters:
        # TODO: Implement position, age, rating filters
        pass

    cursor = conn.execute(query, params)
    players = []

    for row in cursor.fetchall():
        data = json.loads(row["data_json"])
        if data.get("scout_hidden") or data.get("academy_team_id") or data.get("is_academy"):
            continue
        players.append(data)

    if not players:
        return {
            "total_players": 0,
            "avg_market_value": 0,
            "avg_age": 0,
            "avg_by_position": {},
        }

    total_value = sum(p.get("market_value", 0) for p in players)
    total_age = sum(p.get("bio", {}).get("age", 25) for p in players)

    avg_by_position = {}
    positions = ["PG", "SG", "SF", "PF", "C"]
    for pos in positions:
        pos_players = [p for p in players if p.get("position") == pos]
        if pos_players:
            avg_by_position[pos] = sum(p.get("market_value", 0) for p in pos_players) / len(pos_players)
        else:
            avg_by_position[pos] = 0

    return {
        "total_players": len(players),
        "avg_market_value": total_value / len(players) if players else 0,
        "avg_age": total_age / len(players) if players else 0,
        "avg_by_position": avg_by_position,
    }


def get_value_players(
    conn: sqlite3.Connection,
    position: Optional[str] = None,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """Find undervalued players (high potential, low price, young)."""
    cursor = conn.execute("SELECT id, name, data_json FROM player")
    candidates = []

    for row in cursor.fetchall():
        data = json.loads(row["data_json"])
        if data.get("scout_hidden") or data.get("academy_team_id") or data.get("is_academy") or data.get("is_prospect"):
            continue
        attrs = data.get("attributes") or {}
        overall = int(sum(attrs.values()) / len(attrs)) if attrs else 500
        potential = data.get("potential", 0)
        market_value = data.get("market_value", 0)
        age = data.get("bio", {}).get("age", 30)
        pos = data.get("position", "")

        # Filter criteria
        if position and pos != position:
            continue

        if potential - overall >= 50 and market_value < 1000000 and age <= 28:
            candidates.append({
                "id": row["id"],
                "name": row["name"],
                "position": pos,
                "potential": potential,
                "market_value": market_value,
                "age": age,
                "potential_diff": potential - overall,
            })

    # Sort by potential difference
    candidates.sort(key=lambda x: x["potential_diff"], reverse=True)
    return candidates[:limit]


# ============================================================================
# TRANSFER HISTORY
# ============================================================================

def record_transfer(
    conn: sqlite3.Connection,
    team_id: int,
    player_id: int,
    transfer_data: Dict[str, Any],
) -> Dict[str, Any]:
    """Record a completed transfer in history."""
    team = conn.execute("SELECT data_json FROM team WHERE id = ?", (team_id,)).fetchone()
    if not team:
        return {"ok": False, "error": "Team not found"}

    transfer = {
        "player_id": player_id,
        "type": transfer_data.get("type", "in"),  # in | out | loan_in | loan_out
        "fee": transfer_data.get("fee", 0),
        "date": int(time.time()),
        "from_team": transfer_data.get("from_team", ""),
        "to_team": transfer_data.get("to_team", ""),
    }
    _append_transfer_history(conn, team_id, transfer)

    store_row = transfer_data.get("store_row", True)
    if store_row:
        season_id = transfer_data.get("season_id")
        from_team_id = transfer_data.get("from_team_id")
        to_team_id = transfer_data.get("to_team_id")
        date_str = transfer_data.get("date") or date.today().isoformat()
        conn.execute(
            "INSERT INTO transfer (season_id, player_id, from_team_id, to_team_id, transfer_type, fee, date, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                season_id,
                player_id,
                from_team_id,
                to_team_id,
                transfer.get("type"),
                transfer.get("fee"),
                date_str,
                json.dumps(transfer_data or {}, ensure_ascii=True),
            ),
        )
        conn.commit()

    return {"ok": True, "transfer": transfer}


def get_transfer_history(
    conn: sqlite3.Connection,
    team_id: int,
    seasons: int = 3,
) -> List[Dict[str, Any]]:
    """Get transfer history for the last N seasons."""
    team = conn.execute("SELECT data_json FROM team WHERE id = ?", (team_id,)).fetchone()
    if not team:
        return []

    data = json.loads(team["data_json"])
    history = data.get("transfer_history", [])

    # Filter by time (approximate: 1 season = 365 days)
    cutoff = int(time.time()) - (seasons * 365 * 24 * 60 * 60)
    recent = [t for t in history if t.get("date", 0) >= cutoff]

    return recent


def get_transfer_balance(
    conn: sqlite3.Connection,
    team_id: int,
    season: Optional[int] = None,
) -> Dict[str, int]:
    """Calculate transfer balance (spent vs received)."""
    team = conn.execute("SELECT data_json FROM team WHERE id = ?", (team_id,)).fetchone()
    if not team:
        return {"spent": 0, "received": 0, "net": 0}

    data = json.loads(team["data_json"])
    history = data.get("transfer_history", [])

    # TODO: Filter by season if provided
    spent = sum(t.get("fee", 0) for t in history if t.get("type") in ["in", "loan_in"])
    received = sum(t.get("fee", 0) for t in history if t.get("type") in ["out", "loan_out"])

    return {
        "spent": spent,
        "received": received,
        "net": spent - received,
    }


# ============================================================================
# SCOUTING / AI MARKET
# ============================================================================

def assign_scout(
    conn: sqlite3.Connection,
    team_id: int,
    player_id: int,
    tier: int | None = None,
    scout_id: int | None = None,
    current_date: str | None = None,
) -> Dict[str, Any]:
    team = conn.execute("SELECT id FROM team WHERE id = ?", (team_id,)).fetchone()
    if not team:
        return {"ok": False, "error": "Team not found"}
    player = conn.execute("SELECT id FROM player WHERE id = ?", (player_id,)).fetchone()
    if not player:
        return {"ok": False, "error": "Player not found"}

    tier = max(1, min(6, int(tier or 3)))
    accuracy = max(50, 110 - (tier * 10))
    created_at = int(time.time())
    expires_at = created_at + (90 * 24 * 60 * 60)
    report_data = {
        "tier": tier,
        "accuracy": accuracy,
        "assigned_at": current_date or date.today().isoformat(),
        "notes": "scout_assigned",
    }
    conn.execute(
        "INSERT INTO scout_report (player_id, team_id, scout_id, created_at, expires_at, accuracy, data_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            int(player_id),
            int(team_id),
            int(scout_id) if scout_id else None,
            created_at,
            expires_at,
            accuracy,
            json.dumps(report_data, ensure_ascii=True),
        ),
    )
    conn.commit()
    return {"ok": True, "report": report_data}


def get_scout_report(
    conn: sqlite3.Connection,
    team_id: int,
    player_id: int,
) -> Dict[str, Any]:
    row = conn.execute(
        "SELECT data_json, created_at, expires_at, accuracy FROM scout_report WHERE team_id = ? AND player_id = ? ORDER BY created_at DESC LIMIT 1",
        (int(team_id), int(player_id)),
    ).fetchone()
    if not row:
        return {"ok": False, "error": "Report not found"}
    data = json.loads(row["data_json"]) if row["data_json"] else {}
    data["created_at"] = row["created_at"]
    data["expires_at"] = row["expires_at"]
    data["accuracy"] = row["accuracy"]
    return {"ok": True, "report": data}


def _finalize_transfer(
    conn: sqlite3.Connection,
    to_team_id: int,
    player_id: int,
    offer: Dict[str, Any],
    current_date: date,
) -> None:
    player = _get_player(conn, player_id)
    if not player:
        return
    player_data = player.get("data") or {}
    from_team_id = player_data.get("team_id")

    team = _get_team(conn, to_team_id)
    team_data = team.get("data") if team else {}
    league_id = team_data.get("league_id") or team_data.get("league") or team_data.get("leagueId") or "ACB"

    player_data["team_id"] = int(to_team_id)
    player_data["contract_type"] = "scholarship" if _is_scholarship_player(player_data) or _is_ncaa_league(league_id) else "pro"
    conn.execute(
        "UPDATE player SET data_json = ?, updated_at = ? WHERE id = ?",
        (json.dumps(player_data, ensure_ascii=True), int(time.time()), int(player_id)),
    )
    conn.commit()
    universe = _league_universe(league_id)
    tier = int((player_data.get("scout") or {}).get("tier") or 3)
    budget = int(team_data.get("budget") or 0)
    roster_size = int(team_data.get("roster_size") or 12)
    contract = create_contract_data(tier, budget, roster_size=roster_size, universe=universe)
    years = int(offer.get("contract_years") or contract.get("years") or 1)
    wage = int(offer.get("wage") or contract.get("salary") or 0)
    contract["salary"] = wage
    contract["yearly_salary"] = [wage for _ in range(max(1, years))]
    contract["years"] = years
    contract["start_date"] = current_date.isoformat()
    if not contract.get("end_date"):
        try:
            end_date = current_date.replace(year=current_date.year + years)
        except ValueError:
            end_date = current_date.replace(month=2, day=28, year=current_date.year + years)
        contract["end_date"] = end_date.isoformat()
    if offer.get("clauses"):
        contract["clauses"] = offer.get("clauses")
    if offer.get("bonuses"):
        contract["bonuses"] = offer.get("bonuses")
    contract_type = "scholarship" if _is_scholarship_player(player_data) or _is_ncaa_league(league_id) else "pro"
    contract = apply_contract_type(contract, contract_type)
    contract_repo.create_contract(
        conn,
        player_id=int(player_id),
        team_id=int(to_team_id),
        data=contract,
        updated_at=int(time.time()),
    )

    fee = int(offer.get("fee", 0) or 0)
    if fee:
        _update_team_budget(conn, int(to_team_id), -fee)
        if from_team_id:
            _update_team_budget(conn, int(from_team_id), fee)

    agency_id = player_data.get("agency_id")
    agent_fee = 0
    if contract_type != "scholarship" and agency_id:
        discount = get_agency_discount(conn, int(to_team_id), str(agency_id))
        base_rate = 0.05
        rate = max(0.01, base_rate * (1.0 - discount))
        agent_fee = int(max(0, wage) * rate)
        if agent_fee:
            _update_team_budget(conn, int(to_team_id), -agent_fee)
        record_agency_deal(conn, int(to_team_id), str(agency_id))

    if agent_fee:
        _log_market_event(
            conn,
            int(to_team_id),
            "Comision de agente",
            f"Comision de agente: -{agent_fee}.",
            current_date,
            event_type="market",
            severity="info",
        )

    transfer_payload = {
        "type": "in",
        "fee": fee,
        "from_team_id": from_team_id,
        "to_team_id": to_team_id,
        "date": current_date.isoformat(),
        "agent_fee": agent_fee,
    }
    record_transfer(conn, int(to_team_id), int(player_id), transfer_payload)
    if from_team_id:
        record_transfer(
            conn,
            int(from_team_id),
            int(player_id),
            {**transfer_payload, "type": "out", "store_row": False},
        )


def simulate_day(
    conn: sqlite3.Connection,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    current_date = _parse_iso_date(str(payload.get("current_date") or "")) or date.today()

    teams = conn.execute("SELECT id, data_json FROM team").fetchall()
    resolved = 0
    for row in teams:
        team_id = int(row["id"])
        data = json.loads(row["data_json"])
        negotiations = data.get("active_negotiations", [])
        if not negotiations:
            continue
        updated = False
        for neg in negotiations:
            status = neg.get("status")
            offer = neg.get("current_offer", {}) or {}
            player_id = neg.get("player_id")
            if not player_id:
                continue
            player = _get_player(conn, int(player_id))
            if not player:
                continue
            player_data = player.get("data") or {}
            market_value = int(player_data.get("market_value") or 0)
            league_id = data.get("league_id") or data.get("league") or data.get("leagueId") or "ACB"
            scholarship = _is_scholarship_player(player_data) or _is_ncaa_league(league_id)

            if status == "pending":
                deadline_date = _parse_iso_date(str(neg.get("deadline_date") or ""))
                if deadline_date and current_date < deadline_date:
                    continue
                fee = int(offer.get("fee") or 0)
                threshold = 0 if scholarship else market_value * random.uniform(0.65, 0.95)
                if fee >= threshold:
                    neg["status"] = "club_accepted"
                    neg["phase"] = "agent"
                    neg["counter_offer"] = None
                    neg["counter_rounds"] = 0
                    neg.setdefault("history", []).append({
                        "timestamp": int(time.time()),
                        "description": "Club acepta la oferta",
                    })
                    neg.setdefault("messages", []).append(
                        {
                            "date": current_date.isoformat(),
                            "from": "club",
                            "tone": "positive",
                            "text": "El club acepta la oferta. El agente del jugador quiere hablar de condiciones.",
                        }
                    )
                    _log_market_event(
                        conn,
                        team_id,
                        "Oferta aceptada",
                        f"El club acepta la oferta por {player.get('name')}.",
                        current_date,
                        event_type="market",
                        severity="info",
                    )
                else:
                    counter_rounds = int(neg.get("counter_rounds") or 0)
                    if counter_rounds >= 2:
                        neg["status"] = "player_rejected"
                        neg.setdefault("history", []).append({
                            "timestamp": int(time.time()),
                            "description": "Oferta rechazada",
                        })
                        neg.setdefault("messages", []).append(
                            {
                                "date": current_date.isoformat(),
                                "from": "club",
                                "tone": "negative",
                                "text": "El club rechaza la oferta definitivamente.",
                            }
                        )
                        _log_market_event(
                            conn,
                            team_id,
                            "Oferta rechazada",
                            f"La oferta por {player.get('name')} fue rechazada.",
                            current_date,
                            event_type="market",
                            severity="info",
                        )
                        updated = True
                        resolved += 1
                        continue

                    suggested_fee = 0 if scholarship else int(max(0, round(threshold)))
                    neg["counter_offer"] = {
                        **(neg.get("counter_offer") or {}),
                        "fee": suggested_fee,
                    }
                    neg["counter_rounds"] = counter_rounds + 1
                    neg["phase"] = "club"
                    neg["deadline_date"] = (current_date + timedelta(days=3)).isoformat()
                    neg.setdefault("history", []).append({
                        "timestamp": int(time.time()),
                        "description": f"Contraoferta del club: fee objetivo {suggested_fee}",
                        "counter_offer": {"fee": suggested_fee},
                    })
                    neg.setdefault("messages", []).append(
                        {
                            "date": current_date.isoformat(),
                            "from": "club",
                            "tone": "firm",
                            "text": f"El club quiere más dinero fijo. Fee objetivo: {suggested_fee}.",
                        }
                    )
                    _log_market_event(
                        conn,
                        team_id,
                        "Contraoferta del club",
                        f"El club pide un fee mayor por {player.get('name')}.",
                        current_date,
                        event_type="market",
                        severity="info",
                    )
                updated = True
                continue

            if status == "club_accepted":
                neg["status"] = "negotiating_wage"
                neg["phase"] = "agent"
                neg["counter_offer"] = None
                neg["counter_rounds"] = 0
                neg.setdefault("history", []).append({
                    "timestamp": int(time.time()),
                    "description": "Negociando salario",
                })
                neg.setdefault("messages", []).append(
                    {
                        "date": current_date.isoformat(),
                        "from": "agent",
                        "tone": "neutral",
                        "text": "El agente quiere negociar salario y condiciones.",
                    }
                )
                _log_market_event(
                    conn,
                    team_id,
                    "Negociacion salarial",
                    f"Inicia negociacion salarial por {player.get('name')}.",
                    current_date,
                    event_type="market",
                    severity="info",
                )
                updated = True
                continue

            if status == "negotiating_wage":
                deadline_date = _parse_iso_date(str(neg.get("deadline_date") or ""))
                if deadline_date and current_date < deadline_date:
                    continue
                wage = int(offer.get("wage") or 0)
                expected = 0 if scholarship else _expected_wage(market_value, league_id)
                if wage >= expected:
                    neg["status"] = "agreed"
                    neg["phase"] = "done"
                    neg["counter_offer"] = None
                    neg["counter_rounds"] = 0
                    neg.setdefault("history", []).append({
                        "timestamp": int(time.time()),
                        "description": "Acuerdo alcanzado",
                    })
                    neg.setdefault("messages", []).append(
                        {
                            "date": current_date.isoformat(),
                            "from": "agent",
                            "tone": "positive",
                            "text": "Acuerdo alcanzado. El jugador acepta firmar.",
                        }
                    )
                    _finalize_transfer(conn, team_id, int(player_id), offer, current_date)
                    _log_market_event(
                        conn,
                        team_id,
                        "Fichaje completado",
                        f"Acuerdo cerrado por {player.get('name')}.",
                        current_date,
                        event_type="transfer",
                        severity="info",
                    )
                else:
                    counter_rounds = int(neg.get("counter_rounds") or 0)
                    if counter_rounds >= 2:
                        neg["status"] = "rejected"
                        neg["phase"] = "done"
                        neg.setdefault("history", []).append({
                            "timestamp": int(time.time()),
                            "description": "Negociacion salarial fallida",
                        })
                        neg.setdefault("messages", []).append(
                            {
                                "date": current_date.isoformat(),
                                "from": "agent",
                                "tone": "negative",
                                "text": "No hay acuerdo salarial. La negociación se rompe.",
                            }
                        )
                        _log_market_event(
                            conn,
                            team_id,
                            "Negociacion fallida",
                            f"Negociacion salarial fallida por {player.get('name')}.",
                            current_date,
                            event_type="market",
                            severity="info",
                        )
                        updated = True
                        resolved += 1
                        continue

                    suggested_wage = 0 if scholarship else int(max(0, expected))
                    neg["counter_offer"] = {
                        **(neg.get("counter_offer") or {}),
                        "wage": suggested_wage,
                    }
                    neg["counter_rounds"] = counter_rounds + 1
                    neg["phase"] = "agent"
                    neg["deadline_date"] = (current_date + timedelta(days=3)).isoformat()
                    neg.setdefault("history", []).append({
                        "timestamp": int(time.time()),
                        "description": f"Contraoferta del agente: salario objetivo {suggested_wage}",
                        "counter_offer": {"wage": suggested_wage},
                    })
                    neg.setdefault("messages", []).append(
                        {
                            "date": current_date.isoformat(),
                            "from": "agent",
                            "tone": "firm",
                            "text": f"El agente pide un salario mayor. Salario objetivo: {suggested_wage}.",
                        }
                    )
                    _log_market_event(
                        conn,
                        team_id,
                        "Contraoferta del agente",
                        f"El agente pide un salario mayor por {player.get('name')}.",
                        current_date,
                        event_type="market",
                        severity="info",
                    )
                updated = True
                continue

        if updated:
            data["active_negotiations"] = negotiations
            conn.execute(
                "UPDATE team SET data_json = ? WHERE id = ?",
                (json.dumps(data, ensure_ascii=True), team_id),
            )
            conn.commit()

    return {"ok": True, "resolved": resolved}
