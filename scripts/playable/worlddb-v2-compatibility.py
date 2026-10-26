"""Evidence audit, not a rule generator. External databases stay immutable/read-only."""
import hashlib
import json
import os
import sqlite3
import sys
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

sys.dont_write_bytecode = True
root = Path(os.environ.get('WORLDDB_SOURCE_ROOT', 'C:/BDM_DB/WORLDDB_PBM'))
pgm = Path(os.environ.get('BDM_PGM_SOURCE', 'C:/BDM_DB/PBM_WORLD_EXPERIMENT/pgm-source'))
production = Path(os.environ.get('BDM_PGM_DATABASE', 'C:/BDM_DB/BDM-DB/population/production/output/bdm_world_prod.db'))
sys.path.insert(0, str(root / 'WORLDDB_RUNTIME_V1'))
from runtime import available, attach, memberships, pin_master


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def normalized(name):
    return ''.join(c for c in unicodedata.normalize('NFKD', name).lower() if c.isalnum())


master = root / 'WORLDDB_UNIFIED_V2/worlddb_bdm_btw_v2.sqlite'
pin_master(master)
catalog = available(master)
bundle = json.loads(Path('src/data/worlddb-v2/competition-runtime.json').read_text(encoding='utf-8'))
configs = json.loads(Path('src/data/worlddb-v2/competitions.json').read_text(encoding='utf-8'))
mapped = {c['sourceCompetitionId']: c for c in configs}
target = Path('docs/playable/evidence/worlddb-v2-03')
target.mkdir(parents=True, exist_ok=True)
inventories, documents, research = [], [], []
for path in sorted((pgm / 'reference-packs/competition-formats/seasons').rglob('*.json')):
    doc = json.loads(path.read_text(encoding='utf-8-sig'))
    documents.append(dict(path=str(path), sha256=sha(path), competition_id=doc['competition_id'],
                          status=doc['status'], variants=doc['variants'], sources=doc.get('sources', [])))


def collect_research(value):
    if isinstance(value, dict):
        if 'competition_season_id' in value and 'research_status' in value:
            research.append(value)
        else:
            for child in value.values():
                collect_research(child)
    elif isinstance(value, list):
        for child in value:
            collect_research(child)


for path in sorted((pgm / 'production/output/b04-research-batches-v1').glob('batch-*.json')):
    collect_research(json.loads(path.read_text(encoding='utf-8-sig')))
    inventories.append(dict(path=str(path), sha256=sha(path), kind='RESEARCH_METADATA_ONLY'))

pgm_competitions = []
if production.exists():
    before = sha(production)
    db = sqlite3.connect(production.resolve().as_uri() + '?mode=ro&immutable=1', uri=True)
    db.row_factory = sqlite3.Row
    pgm_competitions = [dict(r) for r in db.execute('''SELECT c.competition_id,e.canonical_name,
        c.scope_place_id,c.gender,c.category,
        (SELECT count(*) FROM competition_season s WHERE s.competition_id=c.competition_id) seasons,
        (SELECT count(*) FROM competition_structure_node n JOIN competition_season s
         ON s.competition_season_id=n.competition_season_id WHERE s.competition_id=c.competition_id) structure_nodes
        FROM competition c JOIN entity e ON e.entity_id=c.entity_id''')]
    inventories.append(dict(path=str(production), sha256=before, kind='NORMALIZED_PGM_DATABASE',
                            competitions=len(pgm_competitions), table_counts={t: db.execute('SELECT count(*) FROM '+t).fetchone()[0]
                            for t in ['competition_season','competition_structure_node','competition_contest_format','competition_series_format','competition_contest_hosting_rule']}))
    db.close()
    assert sha(production) == before

special = {
    'DYN_championnat:44': 'NBA bundle exists; conference/play-in/82-game projection and PBM participant assignments require verification. Do not bind it to the FIBA league adapter.',
    'DYN_championnat:71': 'NCAA I aggregates 353 PBM clubs; shipped formats are separate conferences and tournament. Conference membership and edition mapping are indispensable.',
    'DYN_championnat:109': 'NBB authoring document has 20 teams, explicit bracket and HAAHH series. PBM has 20 clubs. Normalize/export through existing tooling and verify hosting/qualification contracts before READY_TO_CONNECT. No new sporting rules need authoring for this candidate.',
    'DYN_championnat:93': 'Argentina authoring document has 19 teams; canonical IDs are unreconciled, multiple qualification paths and HIGHER_SEED without an explicit series pattern need an existing runtime contract. Do not infer them.',
    'DYN_championnat:15': 'PGM ProA promotion evidence exists, including a two-game aggregate final. This differs from the existing FIBA SERIES final contract.',
    'DYN_championnat:3': 'Elite 2 PGM identity and structure exist; export/hosting/bracket connection to this adapter remains unverified. Do not substitute Betclic rules.'
}
c = sqlite3.connect(':memory:', uri=True)
c.row_factory = sqlite3.Row
attach(c, master)
rows = []
for comp in catalog['competitions']:
    if not comp['initializable']:
        continue
    table, key = comp['key'].split(':')
    source_id = 'pbm:' + comp['key']
    clubs = [team for team, _ in memberships(c, table, int(key))]
    rosters = {str(team): c.execute('SELECT count(*) FROM world.DYN_joueur WHERE team_id=? AND is_alive=1 AND retraite=0', (team,)).fetchone()[0] for team in clubs}
    country = c.execute("SELECT iso3 FROM world.db02_country_code_map WHERE pbm_country_id=? AND mapping_status='MATCHED'", (comp.get('country_id'),)).fetchone()
    iso3 = country[0] if country else None
    phases = [dict(r) for r in c.execute('SELECT * FROM world.STA_competition_phase WHERE id_competition=? ORDER BY ordre', (int(key),))] if table == 'DYN_championnat' else []
    candidates = [p for p in pgm_competitions if (iso3 and p['scope_place_id'] == 'place:country:' + iso3) or normalized(p['canonical_name']) == normalized(comp['name'])]
    candidates.sort(key=lambda p: SequenceMatcher(None, normalized(comp['name']), normalized(p['canonical_name'])).ratio(), reverse=True)
    candidates = [dict(p, correspondence='UNVERIFIED_COUNTRY_OR_NAME_CANDIDATE') for p in candidates[:5]]
    config = mapped.get(source_id)
    proof_path = target / ('native-' + config['countryCode'] + '/acceptance.json') if config else None
    proof = json.loads(proof_path.read_text(encoding='utf-8')) if proof_path and proof_path.exists() else None
    required = {'native-new-game-league-club','original-roster','real-match-acta-standings','contact-offer-governance-sign','renew-original-contract','close-load-continue'}
    playable = bool(proof and proof['competition'] == source_id and required <= {s['name'] for s in proof['steps']} and all(s['status'] == 'PASS' for s in proof['steps']))
    lifecycle = 'NOT_CERTIFIED'
    notes = special.get(comp['key'], 'PBM participants and raw phases recorded. PGM candidates remain unverified. Reconcile identity, gender/category, participants, phase graph, hosting and engine contract before projecting a career.')
    if config:
        season_path = target / ('season-' + config['countryCode'] + '.json')
        if season_path.exists():
            season_proof = json.loads(season_path.read_text(encoding='utf-8'))
            lifecycle = 'COMPLETE_SEE_SEPARATE_CONTINUITY' if season_proof.get('passed') else season_proof.get('status', 'NOT_CERTIFIED')
        notes = 'Native NEW GAME, original roster, MatchEngine, acta/standings, canonical Finance/Governance signing, renewal and Save V4 reopen certified.' if playable else 'Configured mapping requires native acceptance evidence.'
    rows.append(dict(source_id=source_id, name=comp['name'], country_id=comp.get('country_id'), iso3=iso3,
                     participants=len(clubs), club_ids=clubs, original_rosters=rosters,
                     minimum_roster=min(rosters.values(), default=0),
                     original_phase_records=phases, original_phase_semantics='RAW_UNDECODED_PBM_CODES',
                     pgm_candidates=candidates, native_format_id=config['nativeCompetitionId'] if config else None,
                     status='PLAYABLE' if playable else 'NEEDS_MAPPING', lifecycle=lifecycle, evidence=notes,
                     native_evidence=str(proof_path.relative_to(target)) if playable else None))
c.close()
assert len(rows) == 102
counts = {status: sum(r['status'] == status for r in rows) for status in ['PLAYABLE','READY_TO_CONNECT','NEEDS_MAPPING','BLOCKED']}
result = dict(master_sha256=catalog['master_sha256'], rules_bundle_hash=bundle['content_hash'],
              scope='102 Runtime V1 initializable selections. PLAYABLE covers certified native career operations, not automatic full-season certification.',
              policy='READY_TO_CONNECT requires verified data, executable rules and engine contract. NEEDS_MAPPING does not assert absent rules. BLOCKED requires a demonstrated indispensable missing dependency. Numeric PBM phase codes are not guessed.',
              total=len(rows), counts=counts, shipped_format_count=len(bundle['competition_formats']), pgm_inventories=inventories,
              research_metadata_records=len(research), authoring_documents=documents,
              next_candidate_without_rule_authoring='pbm:DYN_championnat:109 (NBB): existing complete authoring document; normalization/export and runtime contract verification pending.',
              competitions=rows)
(target / 'compatibility.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(total=102, counts=counts, pgm_competitions=len(pgm_competitions), research_records=len(research), authoring_documents=len(documents))))
