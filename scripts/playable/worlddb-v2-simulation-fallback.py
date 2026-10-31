#!/usr/bin/env python3
"""Generate quarantined BDM simulation-format candidates for all 102 PBM selections.

This does NOT publish NEW GAME entries or certify a league. Original PBM clubs,
players, source documents and the four existing playable formats are untouched.
Use the native batch runner and Windows acceptance before publishing candidates.
"""
import argparse
import copy
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


def simulation_document(source_id, name, participants, postseason=False, grouped=False):
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
                "terminal_tie": "BDM_TEAM_ID_DRAW"
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
    if postseason:
        variant = document['variants'][0]
        group_count = 1
        if grouped:
            group_count = 2
            while participants / group_count > 16:
                group_count *= 2
            variant['nodes'][0]['opponent_scope'] = {'type': 'SAME_GROUP', 'payload': {
                'policy': 'BDM_GENERATED_GROUPS', 'generated_group_count': group_count}}
        size = 2 * group_count if grouped else min(8, 2 ** (participants.bit_length() - 1))
        previous = 'REGULAR_SEASON'
        entrants = size
        while entrants >= 2:
            key = 'FINAL' if entrants == 2 else f'PLAYOFF_{entrants}'
            pairings = ([f'{i}-{entrants + 1 - i}' for i in range(1, entrants // 2 + 1)]
                        if previous == 'REGULAR_SEASON' else
                        [f'WINNER_{i}-WINNER_{entrants + 1 - i}' for i in range(1, entrants // 2 + 1)])
            variant['nodes'].append({
                'key': key, 'node_type': 'ROUND', 'role': 'FINAL' if entrants == 2 else 'PLAYOFF',
                'team_count': entrants, 'pairing': {'type': 'FIXED_BRACKET', 'payload': {'matchups': pairings}},
                'contest': {'format_type': 'SERIES', 'best_of': 3, 'wins_required': 2},
                'hosting': {'rule_type': 'SERIES_PATTERN', 'pattern': 'HAH', 'priority_basis': 'HIGHER_SEED'},
            })
            variant['edges'].append({'from': previous, 'to': key,
                                     'selector': 'TOP_N' if previous == 'REGULAR_SEASON' else 'WINNER',
                                     **({'count': size} if previous == 'REGULAR_SEASON' else {})})
            previous, entrants = key, entrants // 2
        document['notes'] = ('GENERATED_SIMULATION, NOT AN OFFICIAL SPORTING FORMAT. '
                             'BDM generated regular season and top-power-of-two HAH best-of-three playoffs; '
                             'original clubs retained. No historical calendar or official fidelity claimed.')
        if grouped:
            document['notes'] += f' {group_count} generated groups by stable club identity; two qualifiers per group. These are not official memberships.'
    return document


def nba_matrix_sim_document(row, participants):
    """Load the versioned NBA simulation graph without inventing source club IDs.

    Each real PBM team is reconciled to East/West at game bootstrap, not here.
    Unrecognized franchise identities fail closed at that boundary.
    """
    if row.get('source_id') != 'pbm:DYN_championnat:44' or row.get('native_format_id') != 'competition:NAM:nba':
        return None
    if not any(item.get('identity') == 'competition:NAM:nba' for item in row.get('official_documentary_evidence') or []):
        return None
    if participants != 30:
        raise ValueError('NBA PBM requires 30 original clubs')
    path = Path(__file__).resolve().parents[2] / 'src/data/worlddb-v2/global-formats.json'
    formats = read(path)
    matched = [doc for doc in formats if doc.get('competition_id') == 'competition:NAM:nba'
               and doc.get('competition_season_id') == 'edition:NAM:nba:2025-26:bdm-matrix:44']
    if len(matched) != 1:
        raise ValueError('NBA BDM matrix source format must resolve uniquely')
    document = matched[0]
    variant = document['variants'][0]
    regular = [node for node in variant['nodes'] if node.get('role') == 'REGULAR_SEASON']
    if (document.get('status') != 'COMPLETE' or len(regular) != 1
        or regular[0].get('team_count') != participants
        or regular[0].get('pairing', {}).get('payload', {}).get('games_per_team') != 82
        or regular[0].get('opponent_scope', {}).get('payload', {}).get('policy') != 'BDM_PINNED_NBA_CONFERENCES'
        or 'GENERATED_SIMULATION' not in document.get('notes', '')):
        raise ValueError('NBA matrix lacks explicit source and simulation guarantees')
    return copy.deepcopy(document)


def nbl_matrix_sim_document(row, participants):
    """NBL27: 10 clubs x 33 matches, six-team play-in; fixture matrix is fiction.

    Scheduling and Ignite Cup overlap are intentionally not reconstructed from
    the published 165-match calendar. Play-in bracket follows NBL published
    pathway, but opponents, dates and classification fallback are BDM generated.
    """
    if row.get('source_id') != 'pbm:DYN_championnat:78' or row.get('native_format_id') != 'competition:AUS:nbl':
        return None
    if participants != 10:
        raise ValueError('NBL PBM requires its 10 source clubs')
    doc = simulation_document(row['source_id'], row['competition'], participants, postseason=True)
    doc.update({
        'competition_id': 'competition:AUS:nbl',
        'competition_season_id': 'edition:AUS:nbl:2026-27:bdm-matrix:78',
        'season_label': '2026-27',
        'notes': ('GENERATED_SIMULATION: original PBM 10 clubs, published NBL27 33 games per club '
                  'and six-team postseason pathway. Opponent matrix, precise dates, home advantage '
                  'in non-source games, Ignite Cup crossover and classification fallback are simulated. '
                  'NOT an official NBL fixture list.'),
        'sources': [
            {'url': 'https://www.nbl.com.au/news/nbl27-schedule-by-the-numbers', 'type': 'OFFICIAL',
             'scope': '10 clubs, 165 games, 33 per team; not imported fixed fixture dates'},
            {'url': 'https://www.nbl.com.au/news/the-nbl26-finals-format-explained', 'type': 'OFFICIAL',
             'scope': 'Six-club postseason, third/fourth seeding qualifier, fifth/sixth play-in and best-of-three semifinals'},
            {'url': SOURCE_URL, 'type': 'SECONDARY',
             'scope': 'BDM generated opponent matrix, dates and standings tiebreak policy'},
        ],
    })
    variant = doc['variants'][0]
    variant['key'] = 'NBL_27_BDM_MATRIX'
    variant['name'] = 'NBL 2026-27 (33 generated games, six-team finals pathway)'
    regular = variant['nodes'][0]
    regular['pairing'] = {'type': 'FIXED_SCHEDULE', 'payload': {'bdm_generated_matrix_v1': True, 'games_per_team': 33}}
    regular['opponent_scope'] = {'type': 'SCHEDULE_MATRIX', 'payload': {'bdm_generated_matrix_v1': True}}
    def knockout(key, role, count, matchups, contest, hosting):
        return {'key': key, 'node_type': 'ROUND', 'role': role, 'team_count': count,
                'pairing': {'type': 'FIXED_BRACKET', 'payload': {'matchups': matchups}},
                'contest': contest, 'hosting': hosting}
    single = {'format_type': 'SINGLE_GAME', 'requires_winner': True}
    by_seed = {'rule_type': 'HIGHER_SEED', 'priority_basis': 'HIGHER_SEED'}
    play_56 = knockout('PLAY_IN_5_6', 'PLAY_IN', 2, ['5-6'], single, by_seed)
    seed_34 = knockout('SEEDING_3_4', 'PLAY_IN', 2, ['3-4'], single, by_seed)
    play_final = knockout('PLAY_IN_FINAL', 'PLAY_IN', 2, ['7-8'], single, by_seed)
    semis = knockout('SEMIFINALS', 'PLAYOFF', 4, ['1-8', '2-7'],
                     {'format_type': 'SERIES', 'best_of': 3, 'wins_required': 2},
                     {'rule_type': 'SERIES_PATTERN', 'pattern': 'HAH', 'priority_basis': 'HIGHER_SEED'})
    championship = knockout('FINAL', 'FINAL', 2, ['WINNER_1-WINNER_2'],
                            {'format_type': 'SERIES', 'best_of': 5, 'wins_required': 3},
                            {'rule_type': 'SERIES_PATTERN', 'pattern': 'HHA AH'.replace(' ', ''), 'priority_basis': 'HIGHER_SEED'})
    variant['nodes'] = [regular, play_56, seed_34, play_final, semis, championship]
    def edge(a, b, selector, **kwargs):
        return {'from': a, 'to': b, 'selector': selector, **kwargs}
    variant['edges'] = [
        edge('REGULAR_SEASON', 'PLAY_IN_5_6', 'RANK_RANGE', rank_from=5, rank_to=6),
        edge('REGULAR_SEASON', 'SEEDING_3_4', 'RANK_RANGE', rank_from=3, rank_to=4),
        edge('REGULAR_SEASON', 'SEMIFINALS', 'RANK_RANGE', rank_from=1, rank_to=2),
        edge('PLAY_IN_5_6', 'PLAY_IN_FINAL', 'WINNER', payload={'playoff_seed': 8}),
        edge('SEEDING_3_4', 'PLAY_IN_FINAL', 'LOSER', payload={'playoff_seed': 7}),
        edge('SEEDING_3_4', 'SEMIFINALS', 'WINNER', payload={'playoff_seed': 7}),
        edge('PLAY_IN_FINAL', 'SEMIFINALS', 'WINNER', payload={'playoff_seed': 8}),
        edge('SEMIFINALS', 'FINAL', 'WINNER'),
    ]
    return doc


def adapt_segunda_feb_simulation(row, participants, documents):
    """Reuse the 2 x 14 topology; mark every unresolved sporting rule simulated.

    Two source PDFs disagree on relegation. We preserve both references, and
    never invent source-fidelity, original group memberships or relegation slots.
    """
    if row.get('source_id') != 'pbm:DYN_championnat:112' or row.get('native_format_id') != 'competition:ESP:segunda-feb':
        return None
    if participants != 28:
        raise ValueError('Segunda FEB PBM must preserve 28 original clubs')
    evidence = row.get('official_documentary_evidence') or []
    if 'dos grupos de 14' not in (row.get('detailed_blocker') or '').lower() or not evidence:
        raise ValueError('Segunda FEB two-group documentary evidence missing')
    native = [doc for doc in documents if doc.get('competition_id') == 'competition:ESP:segunda-feb']
    if len({doc.get('competition_season_id') for doc in native}) > 1:
        raise ValueError('Ambiguous Segunda FEB editions')
    sources = copy.deepcopy(native[0].get('sources', [])) if native else []
    for item in evidence:
        for url in (item.get('sources') or '').split(' | '):
            if url.strip() and not any(source.get('url') == url.strip() for source in sources):
                sources.append({'url': url.strip(), 'type': 'OFFICIAL',
                                'scope': 'Documented source identity and group topology; playoff simulation is NOT official'})
    sources.append({'url': SOURCE_URL, 'type': 'SECONDARY',
                    'scope': 'BDM simulation policy for group assignment, knockout and tie resolution'})
    doc = simulation_document(row['source_id'], row['competition'], 28, postseason=True, grouped=True)
    doc.update({
        'competition_id': 'competition:ESP:segunda-feb',
        'competition_season_id': 'edition:ESP:segunda-feb:2025-26:bdm-adapted:112',
        'season_label': '2025-26', 'sources': sources,
        'notes': ('GENERATED_SIMULATION ADAPTED_DOCUMENTED_FORMAT: preserves the PBM 28 clubs and '
                  'documented two groups of 14. Group assignments, qualification, aggregate knockout '
                  'and classification are BDM simulation, NOT official regulations. '
                  'No promotion/relegation numbers inferred from contradictory source PDFs.'),
    })
    v = doc['variants'][0]
    v['key'] = 'SEGUNDA_FEB_BDM_SIM'
    v['name'] = 'Segunda FEB (two groups, simulated knockout)'
    regular = v['nodes'][0]
    regular['key'] = 'REGULAR_GROUPS'
    regular['opponent_scope'] = {'type': 'SAME_GROUP', 'payload': {
        'policy': 'BDM_GENERATED_GROUPS', 'generated_group_count': 2}}
    metadata = [{
        'key': 'GROUP_' + name, 'node_type': 'GROUP', 'role': 'GROUP_STAGE', 'team_count': 14,
        'pairing': {'type': 'ROUND_ROBIN', 'meetings_per_pair': 2,
                    'payload': {'bdm_generated_group_index': idx}},
        'opponent_scope': {'type': 'SAME_GROUP'},
    } for idx, name in enumerate(('A', 'B'))]
    def aggregate(key, count, pairs):
        return {
            'key': key, 'node_type': 'ROUND', 'role': 'PLAYOFF', 'team_count': count,
            'pairing': {'type': 'FIXED_BRACKET', 'payload': {'matchups': pairs}},
            'contest': {'format_type': 'AGGREGATE', 'leg_count': 2,
                        'tie_resolution': {'method': 'BDM_EXTRA_DECIDER'}},
            'hosting': {'rule_type': 'HIGHER_SEED', 'priority_basis': 'HIGHER_SEED'},
        }
    quarters = aggregate('QUARTERFINALS', 8, ['1-8', '2-7', '3-6', '4-5'])
    semis = aggregate('SEMIFINALS', 4, ['WINNER_1-WINNER_4', 'WINNER_2-WINNER_3'])
    final = {'key': 'FINAL', 'node_type': 'ROUND', 'role': 'FINAL', 'team_count': 2,
             'pairing': {'type': 'FIXED_BRACKET', 'payload': {'matchups': ['WINNER_1-WINNER_2']}},
             'contest': {'format_type': 'SINGLE_GAME', 'requires_winner': True},
             'hosting': {'rule_type': 'NEUTRAL'}}
    v['nodes'] = [regular, *metadata, quarters, semis, final]
    v['edges'] = [
        {'from': 'REGULAR_GROUPS', 'to': 'QUARTERFINALS', 'selector': 'TOP_N', 'count': 8},
        {'from': 'QUARTERFINALS', 'to': 'SEMIFINALS', 'selector': 'WINNER'},
        {'from': 'SEMIFINALS', 'to': 'FINAL', 'selector': 'WINNER'},
    ]
    return doc


def adapt_documented_format(row, participants, documents):
    """Complete missing execution fields in an isolated, explicitly simulated edition.

    Preserve graph, round counts, qualification, consequences and any supplied
    contest/hosting rules. Ambiguous editions and unsupported topology stay visible.
    """
    segunda = adapt_segunda_feb_simulation(row, participants, documents)
    if segunda is not None:
        return segunda
    matches = {d['competition_season_id']: d for d in documents
               if d.get('competition_id') == row.get('native_format_id')}
    if len(matches) != 1:
        return None
    source = next(iter(matches.values()))
    variant = next((v for v in source.get('variants', []) if v.get('is_real_variant')), None)
    variant = variant or next(iter(source.get('variants', [])), None)
    if not variant:
        return None
    regular = [n for n in variant.get('nodes', []) if n.get('role') == 'REGULAR_SEASON']
    grouped_final = adapt_group_winners_final_four(row, participants, source, variant, regular)
    if grouped_final is not None:
        return grouped_final
    grouped_split = adapt_two_pool_split(row, participants, source, variant, regular)
    if grouped_split is not None:
        return grouped_split
    four_pools = adapt_four_pool_second_groups(row, participants, source, variant)
    if four_pools is not None:
        return four_pools
    if len(regular) != 1 or (regular[0].get('pairing') or {}).get('type') != 'ROUND_ROBIN':
        return None
    if (regular[0].get('opponent_scope') or {}).get('type', 'ALL_STAGE') != 'ALL_STAGE':
        return None
    # A smaller cohort must still satisfy every declared seed/rank.
    if any((e.get('rank_to') or e.get('count') or 0) > participants
           for e in variant.get('edges', []) if e.get('from') == regular[0]['key']):
        return None
    document = copy.deepcopy(source)
    document['variants'] = [copy.deepcopy(variant)]
    adapted = document['variants'][0]
    patches = []
    # A container such as FINAL_FOUR has no games of its own. Connect its
    # qualifiers to the child round, retaining the actual semifinal/final nodes.
    for container in list(adapted.get('nodes', [])):
        if container.get('role') != 'FINAL_FOUR' or container.get('contest'):
            continue
        incoming = [e for e in adapted['edges'] if e['to'] == container['key']]
        outgoing = [e for e in adapted['edges'] if e['from'] == container['key']]
        if len(incoming) == len(outgoing) == 1 and incoming[0]['selector'] == 'WINNER' and outgoing[0]['selector'] == 'TOP_N':
            adapted['edges'] = [e for e in adapted['edges'] if e not in incoming + outgoing] + [{**incoming[0], 'to': outgoing[0]['to']}]
            adapted['nodes'].remove(container)
            patches.append(container['key'] + ' transparent event container')
    for node in adapted.get('nodes', []):
        if node.get('role') == 'REGULAR_SEASON':
            if node.get('team_count') != participants:
                node['team_count'] = participants
                patches.append('source cohort participant count')
            if not (node.get('pairing') or {}).get('meetings_per_pair'):
                node['pairing']['meetings_per_pair'] = 2
                patches.append('two meetings per pair')
        contest = node.get('contest') or {}
        if contest.get('format_type') == 'AGGREGATE' and contest.get('leg_count') == 2:
            contest['tie_resolution'] = {'method': 'BDM_EXTRA_DECIDER', 'source_policy': contest.get('tie_resolution') or {}}
            node['hosting'] = {'rule_type': 'HIGHER_SEED', 'priority_basis': 'HIGHER_SEED'}
            patches.append(node['key'] + ' aggregate tie uses a generated third deciding game; each leg uses BDM winner-required match rules')
        if contest and node.get('role') != 'REGULAR_SEASON':
            pairing = node.get('pairing') or {}
            payload = pairing.get('payload') or {}
            if not any(payload.get(k) for k in ['pairing', 'pairings', 'matchups', 'paths']):
                incoming = [e for e in adapted['edges'] if e['to'] == node['key']]
                ranks = [e for e in incoming if e['from'] == regular[0]['key'] and e['selector'] == 'RANK_RANGE']
                winners = [e for e in incoming if e['selector'] == 'WINNER']
                seeds = [rank for e in ranks for rank in range(e['rank_from'], e['rank_to'] + 1)]
                count = node.get('team_count')
                if isinstance(count, int) and count % 2 == 0 and len(winners) <= 1:
                    if len(seeds) == count:
                        pairs = [f'{seeds[i]}-{seeds[-1-i]}' for i in range(count // 2)]
                    elif len(winners) == 1 and len(seeds) == count // 2:
                        pairs = [f'SEED_{seed}-WINNER_{len(seeds)-i}' for i, seed in enumerate(seeds)]
                    elif len(winners) == 1 and not seeds:
                        pairs = [f'WINNER_{i}-WINNER_{count+1-i}' for i in range(1, count // 2 + 1)]
                    else:
                        return None
                    node['pairing'] = {'type': 'FIXED_BRACKET', 'payload': {'matchups': pairs}}
                    patches.append(node['key'] + ' generated fixed qualification paths')
        if contest.get('format_type') == 'SERIES':
            best = contest.get('best_of')
            if not isinstance(best, int) or best < 1 or best % 2 == 0:
                return None
            if not contest.get('wins_required'):
                contest['wins_required'] = best // 2 + 1
                patches.append(node['key'] + ' wins required')
            hosting = node.get('hosting') or {}
            if not hosting or hosting.get('rule_type') == 'HIGHER_SEED':
                node['hosting'] = {'rule_type': 'SERIES_PATTERN', 'pattern': ''.join('H' if i % 2 == 0 else 'A' for i in range(best)), 'priority_basis': 'HIGHER_SEED'}
                patches.append(node['key'] + ' alternating higher-seed hosting')
    seeding = adapted.get('seeding') or {'scheme_type': 'RANK_BASED', 'basis': []}
    if not any(b.get('type') == 'CLASSIFICATION_POINTS_MINILEAGUE_2_1_V1' for b in seeding.get('basis', []) if isinstance(b, dict)):
        seeding['basis'] = [*seeding.get('basis', []), {'type': 'CLASSIFICATION_POINTS_MINILEAGUE_2_1_V1', 'source': 'BDM_GENERATED_SIMULATION', 'terminal_tie': 'BDM_TEAM_ID_DRAW'}]
        adapted['seeding'] = seeding
        patches.append('BDM classification policy')
    if not patches and source.get('status') == 'COMPLETE':
        return None
    if source.get('status') != 'COMPLETE':
        patches.append('partial source execution policy; official fidelity not certified')
    document['status'] = 'COMPLETE'
    document['competition_season_id'] = source['competition_season_id'] + ':bdm-adapted:' + row['source_id'].rsplit(':', 1)[-1]
    adapted['is_real_variant'] = False
    document['notes'] = (source.get('notes') or '') + ' | GENERATED_SIMULATION ADAPTED_DOCUMENTED_FORMAT: ' + '; '.join(patches)
    return document


def adapt_group_winners_final_four(row, participants, source, variant, groups):
    """Reuse four equal group seasons and their final four, including third place."""
    nodes = variant.get('nodes', [])
    finals = [n for n in nodes if n.get('role') == 'FINAL_FOUR']
    placements = [n for n in nodes if n.get('role') == 'PLACEMENT']
    final = [n for n in nodes if n.get('role') == 'FINAL']
    if len(groups) != 4 or len(finals) != 1 or len(final) != 1 or len(placements) != 1 or len(nodes) != 7:
        return None
    meetings = [(n.get('pairing') or {}).get('meetings_per_pair') for n in groups]
    if (any((n.get('pairing') or {}).get('type') != 'ROUND_ROBIN' or
            (n.get('opponent_scope') or {}).get('type') != 'SAME_GROUP' for n in groups)
            or len(set(meetings)) != 1 or not isinstance(meetings[0], int) or meetings[0] < 1
            or participants < 8):
        return None
    group_edges = [e for e in variant.get('edges', []) if e.get('from') in {n['key'] for n in groups}]
    if len(group_edges) != 4 or any(e.get('to') != finals[0]['key'] or e.get('selector') != 'RANK_RANGE'
                                     or e.get('rank_from') != 1 or e.get('rank_to') != 1 for e in group_edges):
        return None
    if not all(any(e.get('from') == finals[0]['key'] and e.get('to') == node['key'] and e.get('selector') == selector
                   for e in variant.get('edges', [])) for node, selector in [(final[0], 'WINNER'), (placements[0], 'LOSER')]):
        return None
    document = copy.deepcopy(source)
    selected = copy.deepcopy(variant)
    document['variants'] = [selected]
    document['status'] = 'COMPLETE'
    document['competition_season_id'] = source['competition_season_id'] + ':bdm-adapted:' + row['source_id'].rsplit(':', 1)[-1]
    selected['is_real_variant'] = False
    regular = {'key': 'REGULAR_GROUPS', 'node_type': 'STAGE', 'role': 'REGULAR_SEASON', 'team_count': participants,
               'pairing': {'type': 'ROUND_ROBIN', 'meetings_per_pair': meetings[0]},
               'opponent_scope': {'type': 'SAME_GROUP', 'payload': {'policy': 'BDM_GENERATED_GROUPS', 'generated_group_count': 4}}}
    semifinal = copy.deepcopy(finals[0])
    semifinal['pairing'] = {'type': 'FIXED_BRACKET', 'payload': {'matchups': ['1-4', '2-3']}}
    semifinal['contest'] = {'format_type': 'SINGLE_GAME', 'requires_winner': True}
    third = copy.deepcopy(placements[0])
    third['pairing'] = {'type': 'FIXED_BRACKET', 'payload': {'matchups': ['LOSER_1-LOSER_2']}}
    championship = copy.deepcopy(final[0])
    championship['pairing'] = {'type': 'FIXED_BRACKET', 'payload': {'matchups': ['WINNER_1-WINNER_2']}}
    # Keep the original group identities because documented consequences refer
    # to them. Games use the single scoped stage; these nodes identify its tables.
    group_metadata = []
    for index, group in enumerate(groups):
        metadata = copy.deepcopy(group)
        metadata['role'] = 'GROUP_STAGE'
        metadata['pairing']['payload'] = {**(metadata['pairing'].get('payload') or {}), 'bdm_generated_group_index': index}
        group_metadata.append(metadata)
    if row['source_id'] == 'pbm:DYN_championnat:42':
        # Simulated exchange with the four relegated NM1 clubs: one winner per pool.
        document.setdefault('consequences', []).extend(
            {'variant_key': selected['key'], 'source_node': group['key'], 'selector': 'RANK_RANGE',
             'rank_from': 1, 'rank_to': 1, 'type': 'PROMOTION',
             'payload': {'destination': 'NM1', 'policy': 'BDM_SIMULATED_GROUP_WINNER'}}
            for group in groups)
    selected['nodes'] = [regular, *group_metadata, semifinal, third, championship]
    selected['edges'] = [{'from': regular['key'], 'to': semifinal['key'], 'selector': 'TOP_N', 'count': 4},
                         {'from': semifinal['key'], 'to': third['key'], 'selector': 'LOSER'},
                         {'from': semifinal['key'], 'to': championship['key'], 'selector': 'WINNER'}]
    selected['seeding'] = {'scheme_type': 'RANK_BASED', 'basis': [{'type': 'CLASSIFICATION_POINTS_MINILEAGUE_2_1_V1', 'source': 'BDM_GENERATED_SIMULATION', 'terminal_tie': 'BDM_TEAM_ID_DRAW'}]}
    document['notes'] = (source.get('notes') or '') + (' | GENERATED_SIMULATION ADAPTED_DOCUMENTED_FORMAT: four source groups and their winners retain the final four and placement game; '
                         'group assignments, semifinal paths, semifinal single-game contest and any added promotion places are BDM-generated, not official.')
    return document


def adapt_two_pool_split(row, participants, source, variant, pools):
    """Preserve two pools, selective carryover, cross-pool games and playoffs."""
    nodes, edges = variant.get('nodes', []), variant.get('edges', [])
    splits = [n for n in nodes if n.get('role') == 'SPLIT_STAGE']
    playoff = [n for n in nodes if n.get('role') in ('PLAYOFF', 'FINAL')]
    if len(pools) != 2 or len(splits) != 2 or len(playoff) != 3 or len(nodes) != 7 or participants % 4:
        return None
    group_size, half = participants // 2, participants // 4
    if half < 4 or any(n.get('team_count') != group_size or (n.get('pairing') or {}).get('type') != 'ROUND_ROBIN' or
                       (n.get('pairing') or {}).get('meetings_per_pair') != 2 or
                       (n.get('opponent_scope') or {}).get('type') != 'SAME_GROUP' for n in pools):
        return None
    for index, node in enumerate(splits):
        incoming = [e for e in edges if e.get('to') == node['key'] and e.get('from') in {p['key'] for p in pools}]
        lower, upper = (1, half) if index == 0 else (half + 1, group_size)
        if len(incoming) != 2 or any(e.get('selector') != 'RANK_RANGE' or e.get('rank_from') != lower or e.get('rank_to') != upper for e in incoming):
            return None
        if (node.get('pairing') or {}).get('type') != 'ROUND_ROBIN' or (node.get('carryover') or {}).get('rule_type') != 'SELECTIVE':
            return None
    quarter, semi, final = playoff
    if not any(e.get('from') == splits[0]['key'] and e.get('to') == quarter['key'] and e.get('rank_to') == 8 for e in edges):
        return None
    document, selected = copy.deepcopy(source), copy.deepcopy(variant)
    document['variants'] = [selected]
    document['status'] = 'COMPLETE'
    document['competition_season_id'] = source['competition_season_id'] + ':bdm-adapted:' + row['source_id'].rsplit(':', 1)[-1]
    selected['is_real_variant'] = False
    regular = {'key': 'REGULAR_GROUPS', 'node_type': 'STAGE', 'role': 'REGULAR_SEASON', 'team_count': participants,
               'pairing': {'type': 'ROUND_ROBIN', 'meetings_per_pair': 2},
               'opponent_scope': {'type': 'SAME_GROUP', 'payload': {'policy': 'BDM_GENERATED_GROUPS', 'generated_group_count': 2}}}
    metadata = []
    for index, pool in enumerate(pools):
        node = copy.deepcopy(pool)
        node['role'] = 'GROUP_STAGE'
        node['pairing']['payload'] = {**(node['pairing'].get('payload') or {}), 'bdm_generated_group_index': index}
        metadata.append(node)
    prepared_splits = []
    for index, split in enumerate(splits):
        node = copy.deepcopy(split)
        node['pairing']['payload'] = {**(node['pairing'].get('payload') or {}), 'bdm_split_policy': 'CROSS_GROUP_CARRYOVER',
                                      'bdm_rank_from': 1 if index == 0 else half + 1,
                                      'bdm_rank_to': half if index == 0 else group_size,
                                      'bdm_round_count': (group_size - 1 + group_size % 2) * 2}
        prepared_splits.append(node)
    prepared_playoff = []
    for node, pairs in zip(playoff, [['1-8', '2-7', '3-6', '4-5'], ['WINNER_1-WINNER_4', 'WINNER_2-WINNER_3'], ['WINNER_1-WINNER_2']]):
        node = copy.deepcopy(node)
        node['pairing'] = {'type': 'FIXED_BRACKET', 'payload': {'matchups': pairs}}
        contest = node.get('contest') or {}
        best = contest.get('best_of')
        if contest.get('format_type') != 'SERIES' or not isinstance(best, int) or best < 1 or best % 2 == 0:
            return None
        contest['wins_required'] = best // 2 + 1
        node['contest'] = contest
        node['hosting'] = {'rule_type': 'SERIES_PATTERN', 'pattern': ''.join('H' if i % 2 == 0 else 'A' for i in range(best)), 'priority_basis': 'HIGHER_SEED'}
        prepared_playoff.append(node)
    selected['nodes'] = [regular, *metadata, *prepared_splits, *prepared_playoff]
    selected['edges'] = [{'from': regular['key'], 'to': node['key'], 'selector': 'RANK_RANGE',
                          'rank_from': node['pairing']['payload']['bdm_rank_from'], 'rank_to': node['pairing']['payload']['bdm_rank_to']}
                         for node in prepared_splits] + [copy.deepcopy(e) for e in edges if e.get('from') in {n['key'] for n in splits + playoff}]
    selected['seeding'] = {'scheme_type': 'RANK_BASED', 'basis': [{'type': 'CLASSIFICATION_POINTS_MINILEAGUE_2_1_V1', 'source': 'BDM_GENERATED_SIMULATION', 'terminal_tie': 'BDM_TEAM_ID_DRAW'}]}
    # The source describes direct promotion plus the playoff winner, with the
    # finalist replacing that winner when the same club earns both places.
    document.setdefault('consequences', []).append({'variant_key': selected['key'], 'source_node': final['key'], 'selector': 'WINNER',
        'type': 'PROMOTION', 'payload': {'policy': 'BDM_WINNER_OR_FINALIST_IF_DUPLICATE'}})
    document['notes'] = (source.get('notes') or '') + (' | GENERATED_SIMULATION ADAPTED_DOCUMENTED_FORMAT: source pools, split groups, carried head-to-head results and cross-pool games retained; '
                         'pool assignments, playoff paths and series hosting generated by BDM; the finalist takes a duplicate playoff promotion place.')
    return document


def adapt_four_pool_second_groups(row, participants, source, variant):
    """Preserve four opening pools, two subsequent pools and final four."""
    nodes, edges = variant.get('nodes', []), variant.get('edges', [])
    pools = [n for n in nodes if n.get('role') == 'GROUP_STAGE' and n.get('node_type') == 'GROUP']
    second = [n for n in nodes if n.get('role') == 'PLAYOFF' and n.get('node_type') == 'GROUP']
    semis = [n for n in nodes if n.get('role') == 'PLAYOFF' and n.get('node_type') == 'ROUND']
    third = [n for n in nodes if n.get('role') == 'PLACEMENT']
    final = [n for n in nodes if n.get('role') == 'FINAL']
    if len(pools) != 4 or len(second) != 2 or len(semis) != 1 or len(third) != 1 or len(final) != 1 or len(nodes) != 9 or participants != 16:
        return None
    if any(n.get('team_count') != 4 or (n.get('pairing') or {}).get('type') != 'ROUND_ROBIN' or
           (n.get('pairing') or {}).get('meetings_per_pair') != 1 for n in pools + second):
        return None
    for index, stage in enumerate(second):
        incoming = [e for e in edges if e.get('to') == stage['key']]
        if len(incoming) != 2 or {e.get('from') for e in incoming} != {n['key'] for n in pools[2*index:2*index+2]} or any(e.get('selector') != 'RANK_RANGE' or e.get('rank_from') != 1 or e.get('rank_to') != 2 for e in incoming):
            return None
        if not any(e.get('from') == stage['key'] and e.get('to') == semis[0]['key'] and e.get('rank_from') == 1 and e.get('rank_to') == 2 for e in edges):
            return None
    if not all(any(e.get('from') == semis[0]['key'] and e.get('to') == node['key'] and e.get('selector') == selector for e in edges)
               for node, selector in [(third[0], 'LOSER'), (final[0], 'WINNER')]):
        return None
    document, selected = copy.deepcopy(source), copy.deepcopy(variant)
    document['variants'], document['status'] = [selected], 'COMPLETE'
    document['competition_season_id'] = source['competition_season_id'] + ':bdm-adapted:' + row['source_id'].rsplit(':', 1)[-1]
    document.setdefault('consequences', [])
    selected['is_real_variant'] = False
    regular = {'key': 'REGULAR_GROUPS', 'node_type': 'STAGE', 'role': 'REGULAR_SEASON', 'team_count': participants,
               'pairing': {'type': 'ROUND_ROBIN', 'meetings_per_pair': 1},
               'opponent_scope': {'type': 'SAME_GROUP', 'payload': {'policy': 'BDM_GENERATED_GROUPS', 'generated_group_count': 4}}}
    metadata = []
    for index, pool in enumerate(pools):
        node = copy.deepcopy(pool)
        node['pairing']['payload'] = {**(node['pairing'].get('payload') or {}), 'bdm_generated_group_index': index}
        metadata.append(node)
    prepared = []
    for index, stage in enumerate(second):
        node = copy.deepcopy(stage)
        node['role'] = 'SPLIT_STAGE'
        node['pairing']['payload'] = {'bdm_split_policy': 'GROUP_ROUND_ROBIN', 'bdm_source_groups': [2*index, 2*index+1],
                                      'bdm_rank_from': 1, 'bdm_rank_to': 2, 'bdm_round_count': 3}
        prepared.append(node)
    semifinal, placement, championship = copy.deepcopy(semis[0]), copy.deepcopy(third[0]), copy.deepcopy(final[0])
    semifinal['pairing'] = {'type': 'FIXED_BRACKET', 'payload': {'matchups': ['1-4', '2-3']}}
    placement['pairing'] = {'type': 'FIXED_BRACKET', 'payload': {'matchups': ['LOSER_1-LOSER_2']}}
    championship['pairing'] = {'type': 'FIXED_BRACKET', 'payload': {'matchups': ['WINNER_1-WINNER_2']}}
    selected['nodes'] = [regular, *metadata, *prepared, semifinal, placement, championship]
    selected['edges'] = [{'from': regular['key'], 'to': n['key'], 'selector': 'RANK_RANGE', 'rank_from': 1, 'rank_to': 2} for n in prepared] + [
        {'from': n['key'], 'to': semifinal['key'], 'selector': 'RANK_RANGE', 'rank_from': 1, 'rank_to': 2} for n in prepared] + [
        {'from': semifinal['key'], 'to': placement['key'], 'selector': 'LOSER'}, {'from': semifinal['key'], 'to': championship['key'], 'selector': 'WINNER'}]
    selected['seeding'] = {'scheme_type': 'RANK_BASED', 'basis': [{'type': 'CLASSIFICATION_POINTS_MINILEAGUE_2_1_V1', 'source': 'BDM_GENERATED_SIMULATION', 'terminal_tie': 'BDM_TEAM_ID_DRAW'}]}
    document['notes'] = (source.get('notes') or '') + (' | GENERATED_SIMULATION ADAPTED_DOCUMENTED_FORMAT: four source pools, two second pools, cross-pool semifinals and placement retained; '
                         'opening group assignments, second-pool reset and venues generated by BDM.')
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
    adapted_count = 0
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
        nba_sim = nba_matrix_sim_document(row, expected_count)
        if nba_sim is not None:
            documents.append(nba_sim)
            candidates.append({
                **config, 'nativeCompetitionId': nba_sim['competition_id'],
                'editionId': nba_sim['competition_season_id'],
                'name': row['competition'], 'currencyCode': 'USD',
                'calendar': 'FORMAT_DERIVED_SIMULATION',
                'nativeStatus': 'CANDIDATE_NATIVE_PENDING',
                'formatProvenance': 'REUSED_DOCUMENTED_FORMAT',
                'simulationPolicy': True,
                'formatReferenceId': row['native_format_id'],
                'formatReferenceResolution': 'NBA_SOURCE_CONFERENCES_WITH_GENERATED_MATRIX',
            })
            evidence.append({
                'source_id': source_id, 'name': row['competition'], 'original_clubs': expected_count,
                'source_status': row['status'], 'format_provenance': 'REUSED_DOCUMENTED_FORMAT',
                'format_reference_id': row['native_format_id'], 'expected_regular_games': 1230,
                'native_status': 'ENGINE_AND_PBM_NAME_RECONCILIATION_PENDING',
                'official_fidelity': 'SOURCE_NBA_CONFERENCES_PLAY_IN_AND_BO7; FIXTURES_AND_TIEBREAK_SIMULATED',
            })
            continue
        nbl_sim = nbl_matrix_sim_document(row, expected_count)
        if nbl_sim is not None:
            documents.append(nbl_sim)
            candidates.append({
                **config, 'nativeCompetitionId': nbl_sim['competition_id'],
                'editionId': nbl_sim['competition_season_id'], 'name': row['competition'],
                'calendar': 'FORMAT_DERIVED_SIMULATION', 'nativeStatus': 'CANDIDATE_NATIVE_PENDING',
                'formatProvenance': 'GENERATED_SIMULATION', 'simulationPolicy': True,
                'formatReferenceId': row['native_format_id'],
                'formatReferenceResolution': 'NBL_SOURCE_RULES_WITH_GENERATED_MATRIX',
            })
            evidence.append({
                'source_id': source_id, 'name': row['competition'], 'original_clubs': expected_count,
                'source_status': row['status'], 'format_provenance': 'GENERATED_SIMULATION',
                'format_reference_id': row['native_format_id'], 'expected_regular_games': expected_count * 33 // 2,
                'native_status': 'ENGINE_AND_WINDOWS_ACCEPTANCE_PENDING',
                'official_fidelity': 'OPPONENTS_DATES_AND_TIEBREAKS_SIMULATED',
            })
            continue
        existing_format, reference_resolution = reusable_documented_format(
            row, expected_count, reusable_formats
        )
        adapted_format = adapt_documented_format(row, expected_count, reusable_formats)
        if adapted_format is not None:
            existing_format = adapted_format
            reference_resolution = 'ADAPTED_DOCUMENTED_FORMAT'
            adapted_count += 1
        if existing_format is None:
            known = {d['competition_season_id']: d for d in reusable_formats
                     if d.get('competition_id') == row.get('native_format_id')}
            if len(known) == 1:
                # Keep known group/split/aggregate/conference structure visible.
                # Unsupported engine topology is not missing regulation and must
                # never be silently replaced by a simpler generated league.
                existing_format = next(iter(known.values()))
                reference_resolution = 'PRESERVED_SOURCE_REQUIRES_ADAPTER'
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
                "simulationPolicy": adapted_format is not None,
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
        capabilities = {c['id'] if isinstance(c, dict) else c for c in row.get('shared_capabilities', [])}
        grouped = expected_count > 24 or bool(capabilities & {'group_stages', 'conferences'})
        document = simulation_document(source_id, row["competition"], expected_count, postseason=True, grouped=grouped)
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
        scope = document['variants'][0]['nodes'][0]['opponent_scope']
        groups = scope.get('payload', {}).get('generated_group_count', 1)
        sizes = [expected_count // groups + (i < expected_count % groups) for i in range(groups)]
        games = sum(n * (n - 1) for n in sizes)
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
            "adapted_documented_format_candidates": adapted_count,
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
    matrix = read(args.matrix)
    # Reuse the already inventoried PBM/B04 recovery packs as well as PGM.
    # Only canonical individual season documents, never saved worlds or calendars.
    inventoried = sorted({path for row in matrix['competitions']
                          for doc in row.get('format_documents', []) for path in doc.get('sources', [])
                          if '/reference-packs/competition-formats/seasons/' in path.replace('\\', '/')
                          and Path(path).is_file()})
    documented = load_format_documents([*sources, *inventoried, *args.format_source])
    package = build_package(matrix, read(args.batch), read(args.published),
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
