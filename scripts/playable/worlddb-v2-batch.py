"""Inventory and prepare all Runtime V1 selections without editing any source.

The TS consumer completes native projection and sporting/market/save checks.
Identity links are data. Fuzzy candidates are evidence only, never enablement.
"""
import hashlib
import csv
import json
import os
import subprocess
import sys
import sqlite3
import unicodedata
from pathlib import Path

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parents[2]
ROOT = Path(os.environ.get('WORLDDB_SOURCE_ROOT', 'C:/BDM_DB/WORLDDB_PBM'))
ARCHIVE = Path(os.environ.get('BDM_FORMAT_ARCHIVE', 'C:/BDM_DB'))
RECOVERY = ARCHIVE / 'worktrees/competition-format-recovery-v7-20261023'
OUT = BASE / '.worlddb-v2/batch-04'


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def normalized(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(value or '')).lower() if c.isalnum())


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sys.path.insert(0, str(ROOT / 'WORLDDB_RUNTIME_V1'))
    from runtime import available, pin_master, decode
    master = ROOT / 'WORLDDB_UNIFIED_V2/worlddb_bdm_btw_v2.sqlite'
    pin_master(master)
    before = sha(master)
    catalog = available(master)
    original = read(BASE / 'docs/playable/evidence/worlddb-v2-03/compatibility.json')
    assert original['master_sha256'] == before, 'Archived PBM membership evidence belongs to a different master'
    facts = {r['source_id']: r for r in original['competitions']}
    connected = {c['sourceCompetitionId']: c for c in read(BASE / 'src/data/worlddb-v2/competitions.json')}
    links = read(BASE / 'scripts/playable/worlddb-v2-correspondences.json')
    evidence_csv = RECOVERY / 'outputs/catalogo_564_competiciones_reconciliado_2026-10-23.csv'
    with evidence_csv.open(encoding='utf-8-sig', newline='') as f:
        reconciled = {r['competition_id_canonico']: r for r in csv.DictReader(f)}
    country_links = {facts[key]['country_id']: value['countryCode'] for key, value in links.items() if value.get('countryCode')}
    source_db = sqlite3.connect(master.resolve().as_uri() + '?mode=ro&immutable=1', uri=True)
    source_db.row_factory = sqlite3.Row
    # Include authoring documents, not just successful historical bundle exports.
    exports = subprocess.check_output(['rg', '--files', str(ARCHIVE), '-g', '*competition*runtime*bundle*.json'], text=True).splitlines()
    authors = list((RECOVERY / 'population/reference-packs/competition-formats/seasons').rglob('*.json'))
    files, formats, errors = [], {}, []
    for path in sorted(set(map(str, [*exports, *authors]))):
        try:
            data = read(path)
            documents = data.get('competition_formats', [data] if 'competition_id' in data else [])
            files.append(dict(path=path, sha256=sha(path), documents=len(documents)))
            for d in documents:
                fingerprint = hashlib.sha256(json.dumps(d, sort_keys=True, ensure_ascii=True).encode()).hexdigest()
                entry = formats.setdefault(fingerprint, dict(sha256=fingerprint, document=d, sources=[]))
                entry['sources'].append(path)
        except Exception as e:
            errors.append(dict(path=path, error=str(e)))
    write(OUT / 'inventory.json', dict(files=files, formats=list(formats.values()), errors=errors))
    report = dict(master_sha256=before, total=0, results=[], inventory='inventory.json',
                  reconciled_catalog=dict(path=str(evidence_csv), sha256=sha(evidence_csv), competitions=len(reconciled)))
    for comp in catalog['competitions']:
        if not comp['initializable']:
            continue
        source_id = 'pbm:' + comp['key']
        row = facts[source_id]
        key = comp['key'].replace(':', '-')
        directory = OUT / key
        directory.mkdir(exist_ok=True)
        config = connected.get(source_id)
        identity = links.get(source_id)
        iso3 = row['iso3'] or country_links.get(row['country_id'])
        aliases, exact = {}, []
        if comp['key'].startswith('DYN_championnat:'):
            raw = source_db.execute('SELECT * FROM DYN_championnat WHERE id=?', (int(comp['key'].split(':')[1]),)).fetchone()
            aliases = {key: decode(raw[key]) for key in ['nom_ligue', 'nom_championnat', 'nom_championnat_original', 'abreviation_championnat']}
            tokens = {normalized(value) for value in aliases.values() if len(normalized(value)) >= 3}
            gender = {0: 'male', 1: 'female'}.get(raw['sexe'])
            for candidate in reconciled.values():
                if not iso3 or candidate['pais_iso3'] != iso3 or candidate['sexo'] != gender:
                    continue
                matches = tokens & {normalized(candidate['nombre']), normalized(candidate['competition_id_canonico'].split(':')[-1])}
                if matches:
                    exact.append(dict(nativeCompetitionId=candidate['competition_id_canonico'], canonicalName=candidate['nombre'],
                                      matched_aliases=sorted(matches), countryCode=iso3, gender=gender,
                                      catalog_memberships=candidate['ddl12_equipos_membresia'], pbm_participants=row['participants']))
        research_only = False
        if config is None and identity is None and len(exact) == 1:
            identity = dict(exact[0], method='EXACT_DECODED_ALIAS_COUNTRY_GENDER_UNIQUE', sourceAliases=aliases,
                            scope='IDENTITY_CONCORDANCE_ONLY_NOT_EXECUTABLE_FORMAT_OR_EDITION_CERTIFICATION')
            research_only = True
        native_id = config['nativeCompetitionId'] if config else (identity or {}).get('nativeCompetitionId')
        candidates = [f for f in formats.values() if f['document']['competition_id'] == native_id]
        def preference(f):
            d = f['document']
            nodes = [n for v in d['variants'] for n in v['nodes'] if n['role'] == 'REGULAR_SEASON']
            fits = len(nodes) == 1 and nodes[0].get('team_count') in (None, row['participants'])
            return (fits, d['status'] == 'COMPLETE', '2025' in d['season_label'])
        candidates.sort(key=preference, reverse=True)
        selected = candidates[0] if candidates else None
        if config is None:
            config = dict(sourceCompetitionId=source_id, currencyCode='EUR', countryId=row['country_id'],
                          countryCode=iso3 or 'UNRESOLVED', name=comp['name'],
                          nativeCompetitionId=native_id or 'UNMAPPED:' + comp['key'],
                          editionId=selected['document']['competition_season_id'] if selected else 'UNMAPPED:' + comp['key'],
                          ecosystemId='worlddb-batch:' + comp['key'], teamCount=row['participants'],
                          calendar='FORMAT_DERIVED_SIMULATION')
        result = dict(source_id=source_id, name=comp['name'], config=config,
                      identityEvidence='CERTIFIED_EXISTING_CONNECTION' if row['status'] == 'PLAYABLE' else identity,
                      identity_scope='RESEARCH_ONLY' if research_only else 'REVIEWED_LINK' if identity or config else 'UNVERIFIED',
                      decoded_source_aliases=aliases, exact_identity_candidates=exact,
                      pgm_candidates=row['pgm_candidates'], original_phase_records=row['original_phase_records'],
                      original_phase_semantics='RAW_UNDECODED_PBM_CODES',
                      candidate_formats=[dict(sha256=f['sha256'], status=f['document']['status'],
                                             edition=f['document']['competition_season_id'], sources=f['sources']) for f in candidates],
                      source_build='PENDING', native_projection='NOT_RUN')
        evidence_ids = set(p['competition_id'] for p in row['pgm_candidates'])
        if native_id:
            evidence_ids.add(native_id)
        result['reconciled_evidence'] = [reconciled[i] for i in sorted(evidence_ids) if i in reconciled]
        if selected:
            write(directory / 'format.json', selected['document'])
            result['formatPath'] = str((directory / 'format.json').relative_to(BASE))
            result['format_notes'] = selected['document'].get('notes')
            result['format_sources'] = selected['document']['sources']
        try:
            target = directory / 'universe.sqlite'
            # Never overwrite an existing universe; the reusable runner resumes it.
            snapshot = directory / 'snapshot.json'
            if not snapshot.exists():
                attempt = 1
                while target.exists() or target.with_name(target.name + '.building').exists():
                    attempt += 1
                    target = directory / ('universe-attempt-' + str(attempt) + '.sqlite')
                request = dict(method='build', sourceRoot=str(ROOT), output=str(target),
                               competitionId=source_id, competitionCatalog=[config],
                               startDate='2025-10-04' if source_id == 'pbm:DYN_championnat:5' else '2025-07-01',
                               seed='worlddb-v2-04-batch')
                raw = subprocess.check_output([sys.executable, '-B', str(BASE / 'src-tauri/resources/worlddb_v2_bridge.py')],
                                              input=json.dumps(request).encode(), cwd=BASE, stderr=subprocess.PIPE)
                snapshot.write_bytes(raw)
            population = read(snapshot)
            assert population['manifest']['master']['sha256'] == before, 'Cached snapshot master mismatch'
            assert {p['entity_id'] for p in population['competitions']} == {source_id}, 'Cached competition selection mismatch'
            expected_clubs = {'pbm:DYN_equipe:' + str(key) for key in row['club_ids']}
            assert {p['entity_id'] for p in population['clubs']} == expected_clubs, 'Original PBM club identities differ'
            result['source_build'] = 'PASS'
            result['snapshotPath'] = str(snapshot.relative_to(BASE))
            result['original_club_ids_preserved'] = True
            result['inherited_issues'] = population['manifest']['issues']
            result['source_population'] = dict(clubs=len(population['clubs']), people=len(population['people']),
                                             free_agents=len(population.get('freeAgents', [])))
        except subprocess.CalledProcessError as e:
            result.update(source_build='BLOCKED', source_error=e.stderr.decode('utf-8', errors='replace'))
        except Exception as e:
            result.update(source_build='BLOCKED', source_error=str(e))
        report['results'].append(result)
        report['total'] += 1
        write(OUT / 'index.json', report)
        print(source_id, result['source_build'], native_id or 'IDENTITY_MAPPING_REQUIRED', flush=True)
    assert report['total'] == 102
    source_db.close()
    assert sha(master) == before
    report['master_intact'] = True
    write(OUT / 'index.json', report)
    write(OUT / 'source-identities.json', dict(master_sha256=before, total=report['total'],
        competitions=[dict(source_id=r['source_id'], passed=r.get('original_club_ids_preserved', False), population=r.get('source_population'), error=r.get('source_error')) for r in report['results']]))


if __name__ == '__main__':
    main()
