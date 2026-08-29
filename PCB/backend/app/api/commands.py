from __future__ import annotations

import sqlite3
from typing import Any, Dict

from ..services import agency_service, agent_service, club_service, competition_service, contract_service, health_service, market_service, match_history_service, match_service, person_service, player_service, player_profile_service, team_service, smartphone_service, rules_service, gm_service, ai_service, youth_service, analytics_service, world_service


class UnknownCommand(Exception):
    pass


def dispatch(command: str, payload: Dict[str, Any], conn: sqlite3.Connection) -> Dict[str, Any]:
    if command == "ping":
        return {"message": "pong"}
    if command == "player.list":
        return player_service.list_players(conn, payload or {})
    if command == "player.create":
        return player_service.create_player(conn, payload or {})
    if command == "player.patch":
        return player_service.patch_player(conn, payload or {})
    if command == "player.match_log":
        return player_profile_service.match_log(conn, payload or {})
    if command == "team.list":
        return team_service.list_teams(conn, payload or {})
    if command == "contract.list":
        return contract_service.list_contracts(conn, payload or {})
    if command == "match.simulate":
        return match_service.simulate(conn, payload or {})
    if command == "match.list":
        return match_history_service.list_matches(conn, payload or {})
    if command == "match.events":
        return match_history_service.list_events(conn, payload or {})
    if command == "match.control":
        return match_service.control(payload or {})
    if command == "match.action":
        return match_service.action(payload or {})
    if command == "agency.list":
        return agency_service.list_agencies(conn, payload or {})
    if command == "agent.list":
        return agent_service.list_agents(conn, payload or {})
    if command == "smartphone.snapshot":
        return smartphone_service.snapshot(conn, payload or {})
    if command == "smartphone.event":
        return smartphone_service.log_event(conn, payload or {})
    if command == "smartphone.content.create":
        return smartphone_service.create_content(conn, payload or {})
    if command == "smartphone.content.list":
        return smartphone_service.list_content(conn, payload or {})
    if command == "gm.snapshot":
        return gm_service.snapshot(conn, payload or {})
    if command == "gm.event.create":
        return gm_service.create_event(conn, payload or {})
    if command == "gm.decision.apply":
        return gm_service.apply_decision(conn, payload or {})
    if command == "gm.advance_day":
        return gm_service.advance_day(conn, payload or {})
    if command == "ai.advance_day":
        return ai_service.advance_day(conn, payload or {})
    if command == "world.advance_day":
        return world_service.advance_day(conn, payload or {})
    if command == "world.prepare_day":
        return world_service.prepare_day(conn, payload or {})
    if command == "world.finalize_day":
        return world_service.finalize_day(conn, payload or {})
    if command == "person.search":
        return person_service.search_people(conn, payload or {})
    if command == "rules.leagues":
        return rules_service.list_leagues()
    if command == "rules.competition_rules":
        return rules_service.get_competition_rules(payload.get("rules_file") or "")
    if command == "rules.snapshot":
        return rules_service.snapshot()
    if command == "rules.reload":
        return rules_service.snapshot()
    if command == "rules.facilities":
        return rules_service.facilities_catalog()
    if command == "rules.board_objectives":
        return rules_service.board_objectives_catalog()
    if command == "rules.contract_catalog":
        return rules_service.contract_catalog(payload or {})
    if command == "competition.ensure":
        return competition_service.ensure_competitions(conn)
    if command == "competition.snapshot":
        return competition_service.snapshot(conn, payload or {})
    if command == "competition.record_result":
        return competition_service.record_result(conn, payload or {})
    if command == "analytics.snapshot":
        return analytics_service.snapshot(conn, payload or {})
    if command == "health.apply_training_day":
        return health_service.apply_training_day(conn, payload or {})
    if command == "upgrade_facility":
        return club_service.upgrade_facility(conn, payload or {})
    if command == "assign_staff_role":
        return club_service.assign_staff_role(conn, payload or {})
    if command == "assign_player_to_coach":
        return club_service.assign_player_to_coach(conn, payload or {})
    if command == "hire_staff":
        return club_service.hire_staff(conn, payload or {})
    if command == "negotiate_objectives":
        return club_service.negotiate_objectives(conn, payload or {})
    if command == "get_facility_bonuses":
        return club_service.get_facility_bonuses(conn, payload or {})
    # Market commands
    if command == "market.add_to_shortlist":
        return market_service.add_to_shortlist(conn, payload.get("team_id"), payload.get("player_id"), payload.get("priority", "medium"), payload.get("notes", ""))
    if command == "market.remove_from_shortlist":
        return market_service.remove_from_shortlist(conn, payload.get("team_id"), payload.get("player_id"))
    if command == "market.update_shortlist":
        return market_service.update_shortlist_item(conn, payload.get("team_id"), payload.get("player_id"), payload.get("updates", {}))
    if command == "market.make_offer":
        return market_service.make_offer(conn, payload.get("team_id"), payload.get("player_id"), payload.get("offer", {}))
    if command == "market.improve_offer":
        return market_service.improve_offer(conn, payload.get("team_id"), payload.get("negotiation_id"), payload.get("offer", {}))
    if command == "market.withdraw_offer":
        return market_service.withdraw_offer(conn, payload.get("team_id"), payload.get("negotiation_id"))
    if command == "market.respond_to_offer":
        return market_service.respond_to_offer(conn, payload.get("team_id"), payload.get("negotiation_id"), payload.get("response"))
    if command == "market.update_agency_relationship":
        return market_service.update_agency_relationship(conn, payload.get("team_id"), payload.get("agency_id"), payload.get("delta", 0))
    if command == "market.record_agency_deal":
        return market_service.record_agency_deal(conn, payload.get("team_id"), payload.get("agency_id"))
    if command == "market.get_agency_discount":
        discount = market_service.get_agency_discount(conn, payload.get("team_id"), payload.get("agency_id"))
        return {"ok": True, "discount": discount}
    if command == "market.get_stats":
        stats = market_service.get_market_stats(conn, payload.get("filters"))
        return {"ok": True, "stats": stats}
    if command == "market.get_value_players":
        players = market_service.get_value_players(conn, payload.get("position"), payload.get("limit", 10))
        return {"ok": True, "players": players}
    if command == "market.record_transfer":
        return market_service.record_transfer(conn, payload.get("team_id"), payload.get("player_id"), payload.get("transfer", {}))
    if command == "market.get_transfer_history":
        history = market_service.get_transfer_history(conn, payload.get("team_id"), payload.get("seasons", 3))
        return {"ok": True, "history": history}
    if command == "market.get_transfer_balance":
        balance = market_service.get_transfer_balance(conn, payload.get("team_id"), payload.get("season"))
        return {"ok": True, "balance": balance}
    if command == "market.assign_scout":
        return market_service.assign_scout(
            conn,
            payload.get("team_id"),
            payload.get("player_id"),
            payload.get("tier"),
            payload.get("scout_id"),
            payload.get("current_date"),
        )
    if command == "market.get_scout_report":
        return market_service.get_scout_report(conn, payload.get("team_id"), payload.get("player_id"))
    if command == "market.simulate_day":
        return market_service.simulate_day(conn, payload or {})
    if command == "youth.promote":
        return youth_service.promote_player(conn, payload.get("team_id"), payload.get("player_id"))
    raise UnknownCommand(command)
