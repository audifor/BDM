"""Audit frozen Runtime V1 selections against shipped BDM formats, without inferring rules."""
import json
import os
import sqlite3
import sys
from collections import Counter
from pathlib import Path

sys.dont_write_bytecode = True
root = Path(os.environ.get('WORLDDB_SOURCE_ROOT', 'C:/BDM_DB/WORLDDB_PBM'))
sys.path.insert(0, str(root / 'WORLDDB_RUNTIME_V1'))
from runtime import available, attach, memberships, pin_master

master = root / 'WORLDDB_UNIFIED_V2/worlddb_bdm_btw_v2.sqlite'
pin_master(master)
catalog = available(master)
bundle = json.loads(Path('src/data/worlddb-v2/competition-runtime.json').read_text(encoding='utf-8'))
formats = {f['competition_id']: f for f in bundle['competition_formats']}
# Explicit source/template correspondences, identified by original country and competition name.
# A correspondence is never permission to substitute this format for another competition.
aliases = {(8, 'Liga Endesa'): 'competition:ESP:liga-endesa',
           (1, 'Betclic Élite'): 'competition:FRA:betclic-elite',
           (3, 'LBA Lega Basket Serie A'): 'competition:ITA:serie-a'}
c = sqlite3.connect(':memory:', uri=True)
attach(c, master)
rows = []
for comp in catalog['competitions']:
    if not comp['initializable']:
        continue
    table, key = comp['key'].split(':')
    clubs = [team for team, _ in memberships(c, table, int(key))]
    rosters = [c.execute('SELECT count(*) FROM world.DYN_joueur WHERE team_id=? AND is_alive=1 AND retraite=0', (team,)).fetchone()[0] for team in clubs]
    native = aliases.get((comp.get('country_id'), comp['name']))
    fmt = formats.get(native)
    pilot = comp['key'] == 'DYN_championnat:5'
    status = 'PLAYABLE' if pilot else 'PENDING' if fmt else 'UNSUPPORTED'
    rows.append(dict(source_id='pbm:' + comp['key'], name=comp['name'], country_id=comp.get('country_id'),
                     participants=len(clubs), club_ids=clubs, original_rosters=dict(zip(map(str, clubs), rosters)),
                     minimum_roster=min(rosters, default=0), five_players_per_club=bool(rosters) and min(rosters)>=5,
                     native_format_id=native, shipped_format=fmt is not None,
                     calendar_engine='ScheduleGenerator + WorldCompetitionCalendar' if fmt else None,
                     standings_engine='calculateStandings + format-specific postseason' if fmt else None,
                     valid_game_world_tested=pilot, native_acceptance_tested=pilot, status=status,
                     limitation=None if pilot else 'PBM selection/projector and native acceptance are currently Liga Endesa only; existing format may be connected without authoring new rules' if fmt else 'No verified correspondence to a shipped BDM competition format; do not infer a regulation from PBM participants'))
c.close()
result = dict(master_sha256=catalog['master_sha256'], rules_bundle_hash=bundle['content_hash'],
              scope='Only Runtime V1 initializable selections; original rosters counted before generated repairs',
              classification_policy='PLAYABLE requires real PBM native pilot proof; COMPATIBLE requires a validated PBM GameWorld plus engines; PENDING has identified connection missing; UNSUPPORTED lacks a verified indispensable format',
              total=len(rows), counts=dict(Counter(r['status'] for r in rows)), competitions=rows)
target = Path('docs/playable/evidence/worlddb-v2-02/compatibility.json')
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(total=result['total'], counts=result['counts'], mapped=[(r['name'],r['participants'],r['status']) for r in rows if r['native_format_id']])))
