#!/usr/bin/env python3
"""Harvest observed 2026-27 NCAA Division I women's fixtures for ALL 363 programs.

The source is a contemporary secondary schedule directory, NOT an NCAA official
fixtures register. Team identities and gender-season membership are read from
the existing checked-in 2026-27 catalog. Unpublished dates are never generated.
This script is idempotent, validates reciprocal listings, and produces a
machine-readable report. It does not touch PBM SQLite or any save file.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
import json
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

MONTHS = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
          "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}
DATE_RE = re.compile(r"^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+(" + "|".join(MONTHS) + r")\s+(\d{1,2})$")
GAME_ID_RE = re.compile(r"-(\d{8,12})$")
USER_AGENT = "BDM-WorldDB-Evidence-Harvester/1.0 (2026-27 NCAA women's schedule reconciliation; no robot bypass)"

def resolve_verified_duplicate(events, excluded):
    resolve_verified_stanford(events)
    # Both directory pages list two ESPN event IDs for the same game. ESPN's
    # 401913047 returns 404; 401919967 resolves to NIU at DePaul on Nov 11.
    # DePaul's own schedule independently confirms the date and venue.
    stale, current = '401913047', '401919967'
    if stale not in events or current not in events:
        return resolve_verified_grand_canyon(events, excluded)
    a, b = events[stale], events[current]
    expected = ('2026-11-11', 'ncaa:2026-27:women:depaul-blue-demons',
                'ncaa:2026-27:women:northern-illinois-huskies')
    if any((row['date'], row['homeProgramId'], row['awayProgramId']) != expected for row in (a, b)):
        raise ValueError('Previously verified DePaul duplicate has changed; recheck sources')
    excluded.append({'reason': 'duplicate_stale_event_id', 'record': a, 'supersededBy': current,
                     'evidence': ['https://depaulbluedemons.com/sports/wbball/schedule/',
                                  'https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/summary?event=401919967',
                                  'https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/summary?event=401913047']})
    del events[stale]
    resolve_verified_grand_canyon(events, excluded)

def resolve_verified_grand_canyon(events, excluded):
    # The directory also repeats Winthrop–Grand Canyon on Nov 23, but the
    # official GCU schedule and the live ESPN event both place it on Nov 25 at
    # a neutral site. Preserve the erroneous source record in the audit trail.
    stale, current = '401915901', '401921390'
    if stale not in events or current not in events:
        return
    a, b = events[stale], events[current]
    expected = ('2026-11-23', 'ncaa:2026-27:women:grand-canyon-lopes',
                'ncaa:2026-27:women:winthrop-eagles')
    if any((row['date'], row['homeProgramId'], row['awayProgramId']) != expected for row in (a, b)):
        raise ValueError('Previously verified Grand Canyon duplicate has changed; recheck sources')
    evidence = ['https://gculopes.com/sports/womens-basketball/schedule?path=wbball',
                'https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/summary?event=401921390',
                'https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/summary?event=401915901']
    excluded.append({'reason': 'duplicate_stale_event_id_and_incorrect_date', 'record': a,
                     'supersededBy': current, 'evidence': evidence})
    b['sourceCorrection'] = {'originalDate': b['date'], 'date': '2026-11-25',
                             'neutralSite': True, 'evidence': evidence}
    b['date'] = '2026-11-25'
    b['neutralSite'] = True
    del events[stale]
    high_point = events.get('401921391')
    if high_point is not None:
        expected_high_point = ('2026-11-25', 'ncaa:2026-27:women:high-point-panthers',
                               'ncaa:2026-27:women:grand-canyon-lopes')
        if (high_point['date'], high_point['homeProgramId'], high_point['awayProgramId']) != expected_high_point:
            raise ValueError('Previously verified High Point fixture has changed; recheck sources')
        high_point['sourceCorrection'] = {'originalDate': high_point['date'], 'date': '2026-11-23',
            'neutralSite': True, 'evidence': [evidence[0],
                'https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/summary?event=401921391']}
        high_point['date'] = '2026-11-23'
        high_point['neutralSite'] = True

def resolve_verified_stanford(events):
    game = events.get('401915984')
    if game is None:
        return
    expected = ('2026-11-29', 'ncaa:2026-27:women:stanford-cardinal',
                'ncaa:2026-27:women:columbia-lions')
    if (game['date'], game['homeProgramId'], game['awayProgramId']) != expected:
        raise ValueError('Previously verified Stanford fixture has changed; recheck sources')
    game['sourceCorrection'] = {'originalDate': game['date'], 'date': '2026-11-27',
        'neutralSite': True, 'evidence': [
            'https://gostanford.com/news/2026/08/28/nonconference-schedule-set',
            'https://hawaiiathletics.com/sports/womens-basketball/schedule']}
    game['date'] = '2026-11-27'
    game['neutralSite'] = True
    showdown = events.get('401918886')
    if showdown is not None:
        expected_showdown = ('2026-11-27', 'ncaa:2026-27:women:columbia-lions',
                             'ncaa:2026-27:women:san-diego-state-aztecs')
        if (showdown['date'], showdown['homeProgramId'], showdown['awayProgramId']) != expected_showdown:
            raise ValueError('Previously verified Columbia fixture has changed; recheck sources')
        showdown['sourceCorrection'] = {'originalDate': showdown['date'], 'date': '2026-11-29',
            'neutralSite': True, 'evidence': ['https://hawaiiathletics.com/sports/womens-basketball/schedule']}
        showdown['date'] = '2026-11-29'
        showdown['neutralSite'] = True

def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))

def fetch_program(program):
    url = program["sourceTeamUrl"]
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "www.ncaawomensbasketball.com":
        raise ValueError("Untrusted source team URL: " + url)
    errors = []
    for attempt in range(3):
        try:
            response = requests.get(url, timeout=35, headers={"User-Agent": USER_AGENT})
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            fixtures = []
            skipped = []
            schedule_anchors = [
                a for a in soup.find_all("a", href=True)
                if a["href"].startswith("/womens-college-basketball/game/")
                and "game details" in a.get_text(" ", strip=True).lower()
            ]
            for anchor in schedule_anchors:
                game_href = anchor["href"].split("?", 1)[0]
                match = GAME_ID_RE.search(game_href.rstrip("/"))
                if not match:
                    skipped.append({"reason": "no_espn_event_id", "href": game_href})
                    continue
                date_header = None
                for header in anchor.find_all_previous(["h3", "h4"], limit=8):
                    header_match = DATE_RE.match(header.get_text(" ", strip=True))
                    if header_match:
                        date_header = header_match
                        break
                if date_header is None:
                    skipped.append({"reason": "no_date_header", "href": game_href})
                    continue
                month = MONTHS[date_header.group(1)]
                year = 2027 if month <= 6 else 2026
                game_date = date(year, month, int(date_header.group(2))).isoformat()
                # Choose the smallest DOM ancestor containing exactly two teams
                # and the game-detail action itself. Header/sidebar links must
                # never be mistaken for a game participant.
                slugs = None
                for parent in anchor.parents:
                    if parent.name in {"body", "html"}:
                        break
                    links = [a.get("href", "") for a in parent.find_all("a", href=True)
                             if a.get("href", "").startswith("/womens-college-basketball/team/")]
                    unique = list(dict.fromkeys(link.split("/team/", 1)[1].split("?", 1)[0].rstrip("/") for link in links))
                    if len(unique) == 2:
                        slugs = unique
                        break
                if slugs is None:
                    skipped.append({"reason": "cannot_isolate_two_teams", "href": game_href})
                    continue
                fixtures.append({
                    "gameId": match.group(1),
                    "date": game_date,
                    "awayProgramId": "ncaa:2026-27:women:" + slugs[0],
                    "homeProgramId": "ncaa:2026-27:women:" + slugs[1],
                    "gameSourceUrl": "https://www.ncaawomensbasketball.com" + game_href,
                })
            # Fail closed on a parser/selector change, rather than writing an
            # apparently empty 363-team calendar.
            if not fixtures:
                raise ValueError(f"No parseable team game cards for {url}; anchors={len(schedule_anchors)} skipped={skipped[:3]}")
            return {"programId": program["id"], "sourceTeamUrl": url, "fixtures": fixtures, "skipped": skipped,
                    "pageGameCards": len(schedule_anchors)}
        except (requests.RequestException, ValueError) as exc:
            errors.append(f"attempt {attempt+1}: {exc}")
            if attempt < 2:
                time.sleep(0.5 + attempt)
    raise RuntimeError("Source retrieval failed " + url + " | " + " | ".join(errors))

def build(catalog):
    if catalog.get("season") != "2026-27":
        raise ValueError("Unexpected NCAA edition")
    women = catalog["genders"]["women"]["teams"]
    ids = {row["id"] for row in women}
    conferences = {row["conferenceId"] for row in women}
    if len(women) != 363 or len(ids) != 363 or len(conferences) != 32:
        raise ValueError("NCAAW catalog must contain exactly 363 unique current Division I programs across 32 conferences")
    pages = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(fetch_program, program): program["id"] for program in women}
        for future in as_completed(futures):
            pages.append(future.result())
    if len(pages) != 363:
        raise ValueError("Not all women's NCAA source programs yielded a schedule")
    pages.sort(key=lambda item: item["programId"])
    events = {}
    excluded = []
    sourceConflicts = []
    for page in pages:
        for record in page["fixtures"]:
            # A fixture on a school's page must actually involve that school.
            # Otherwise DOM sidebar recommendations could silently contaminate
            # the 363-program NCAA schedule.
            if page["programId"] not in (record["homeProgramId"], record["awayProgramId"]):
                excluded.append({"reason": "source_page_is_not_a_participant",
                                 "listedByProgramId": page["programId"], **record})
                continue
            if record["homeProgramId"] not in ids or record["awayProgramId"] not in ids:
                excluded.append({"reason": "outside_current_division_1_women_cohort",
                                 "listedByProgramId": page["programId"], **record})
                continue
            if record["homeProgramId"] == record["awayProgramId"]:
                raise ValueError("Invalid self-fixture " + record["gameId"])
            row = events.get(record["gameId"])
            identity = (record["date"], record["homeProgramId"], record["awayProgramId"])
            if row is None:
                events[record["gameId"]] = {
                    "gameId": record["gameId"], "gender": "women",
                    "date": record["date"], "homeProgramId": record["homeProgramId"],
                    "awayProgramId": record["awayProgramId"], "sourceUrl": record["gameSourceUrl"],
                    "evidenceKind": "SECONDARY_DIRECTORY",
                    "listedByTeamIds": [page["programId"]],
                }
            else:
                original = (row["date"], row["homeProgramId"], row["awayProgramId"])
                if identity != original:
                    sourceConflicts.append({"gameId": record["gameId"], "first": original,
                                            "second": identity, "sourceProgramId": page["programId"]})
                    continue
                if page["programId"] not in row["listedByTeamIds"]:
                    row["listedByTeamIds"].append(page["programId"])
    if sourceConflicts:
        raise ValueError("Schedule identity contradictions: " + json.dumps(sourceConflicts[:8]))
    resolve_verified_duplicate(events, excluded)
    games = sorted(events.values(), key=lambda g: (g["date"], g["gameId"]))
    date_pairs = {}
    duplicate_pairs = []
    for game in games:
        pair = (game["date"], *sorted((game["homeProgramId"], game["awayProgramId"])))
        previous = date_pairs.setdefault(pair, game["gameId"])
        if previous != game["gameId"]:
            duplicate_pairs.append({"date": game["date"], "teams": list(pair[1:]),
                                    "first": events[previous], "second": game})
    if duplicate_pairs:
        raise ValueError("Same NCAA fixture and date have different event IDs: "
                         + json.dumps(duplicate_pairs, ensure_ascii=False))
    team_dates = {}
    team_conflicts = []
    for game in games:
        for team in (game["homeProgramId"], game["awayProgramId"]):
            key = (game["date"], team)
            other = team_dates.setdefault(key, game["gameId"])
            if other != game["gameId"]:
                team_conflicts.append({"team": team, "date": game["date"],
                                       "first": events[other], "second": game})
    if team_conflicts:
        raise ValueError("NCAA women's schools have conflicting games on the same date: "
                         + json.dumps(team_conflicts, ensure_ascii=False))
    for game in games:
        game["listedByTeamIds"].sort()
    conference_by_team = {t["id"]: t["conferenceId"] for t in women}
    by_conf = defaultdict(lambda: {"conferenceGames": 0, "nonconferenceGames": 0})
    for game in games:
        home, away = conference_by_team[game["homeProgramId"]], conference_by_team[game["awayProgramId"]]
        if home == away:
            by_conf[home]["conferenceGames"] += 1
        else:
            by_conf[home]["nonconferenceGames"] += 1
            by_conf[away]["nonconferenceGames"] += 1
    counts = Counter()
    for game in games:
        counts[game["homeProgramId"]] += 1
        counts[game["awayProgramId"]] += 1
    missing = [t["id"] for t in women if counts[t["id"]] == 0]
    if missing:
        raise ValueError("No Division I matches sourced for " + str(len(missing)) + " schools: " + str(missing[:8]))
    summary = {
        "programsRequested": 363, "programsWithSourcePages": len(pages),
        "conferenceCount": 32, "distinctD1Games": len(games),
        "oneSidedSecondaryListings": sum(len(g["listedByTeamIds"]) == 1 for g in games),
        "twoSidedSecondaryListings": sum(len(g["listedByTeamIds"]) == 2 for g in games),
        "externalOrNonDIExcluded": len(excluded),
        "unparsedSourceCards": sum(len(page["skipped"]) for page in pages),
        "minScheduledD1GamesPerProgram": min(counts.values()),
        "maxScheduledD1GamesPerProgram": max(counts.values()),
        "byConference": dict(sorted(by_conf.items())),
    }
    output = {
        "schemaVersion": 1, "season": "2026-27",
        "gender": "women", "division": "NCAA Division I",
        "sourceQuality": "SECONDARY_DIRECTORY_UNVERIFIED_NOT_OFFICIAL",
        "calendarCertification": "NOT_CERTIFIED_INCOMPLETE_UNTIL_PRIMARY_SOURCES_AND_ALL_ROUNDS",
        "summary": summary,
        "sourceDirectory": "https://www.ncaawomensbasketball.com/womens-college-basketball-teams",
        "note": "Only published games are included. No fabricated or inferred fixtures. Source pages are from an independent schedule directory and require school/conference primary verification, distinct from the 112 fully corroborated official ASUN conference games. Future updates may add published games. This does not certify 32 conference tournament rules, 2027 March Madness selections or Windows acceptance.",
        "sourcePages": [{k: v for k, v in page.items() if k != "fixtures"} for page in pages],
        "excluded": excluded,
        "fixtures": games,
    }
    return output

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    output = build(read_json(args.catalog))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(output["summary"], indent=2))
    print("NCAAW schedule is NOT officially certified; 363 programs and 32 conferences were checked.")

if __name__ == "__main__":
    main()
