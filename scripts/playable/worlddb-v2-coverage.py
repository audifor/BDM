"""Export the 102-attempt matrix. Research, engine and native proofs stay distinct."""
import hashlib
import json
from collections import Counter
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
WORK = BASE / '.worlddb-v2/batch-04'
OUT = BASE / 'docs/playable/evidence/worlddb-v2-04'


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    native = read(WORK / 'native-results.json')
    index = read(WORK / 'index.json')
    inventory = read(WORK / 'inventory.json')
    links = read(BASE / 'scripts/playable/worlddb-v2-correspondences.json')
    published = {c['sourceCompetitionId'] for c in read(BASE / 'src/data/worlddb-v2/competitions.json') if c.get('nativeStatus') != 'CANDIDATE_NATIVE_PENDING'}
    rows = []
    for result in native['results']:
        row = {k: v for k, v in result.items() if k not in ['proof']}
        if row['source_id'] in links:
            row['identityEvidence'] = links[row['source_id']]
        if not row['identityEvidence']:
            row['identity_scope'] = 'UNVERIFIED'
        passed = result.get('minimum_flow') == 'PASS'
        row['status'] = 'PLAYABLE' if passed and row['source_id'] in published else 'MAPPED_RESEARCH_ONLY' if row.get('identity_scope') == 'RESEARCH_ONLY' else 'PARTIAL_CONNECTION' if row['identityEvidence'] else 'NEEDS_MAPPING'
        row['minimum_flow_proof'] = {k: v for k, v in result.get('proof', {}).items() if k != 'format'}
        row['lifecycle'] = 'SEPARATE_SEASON_AND_CONTINUITY_EVIDENCE_REQUIRED'
        row['missing_dependency'] = result.get('blocker')
        row['policy'] = 'No missing identity, sporting rule, group assignment, tie-break or hosting pattern is inferred from another competition.'
        if not passed:
            row['next_action'] = 'Reconcile identity/edition and export the actual source format; then rerun this same batch consumer.'
            if row['identityEvidence']:
                row['next_action'] = 'Resolve the explicit runtime blocker and documented missing fields below; reuse the same projection and batch consumer.'
            if row.get('identity_scope') == 'RESEARCH_ONLY':
                row['next_action'] = 'Exact identity concordance is recorded. Reconcile the edition/participants and export an executable format from the cited sources; research metadata is not a runtime rule document.'
        rows.append(row)
    assert len(rows) == 102 and len({r['source_id'] for r in rows}) == 102
    identities = read(WORK / 'source-identities.json')
    assert identities['total'] == 102 and all(r['passed'] for r in identities['competitions'])
    write('source-identities.json', identities)
    counts = Counter(r['status'] for r in rows)
    write('compatibility.json', dict(total=102, counts=dict(counts), master_sha256=index['master_sha256'],
        source_build_counts=dict(Counter(r['source_build'] for r in rows)),
        scope='PLAYABLE = tested career minimum, with Windows family evidence required by publish-catalog. Full-season, external draws, forfeits and cross-division admission are separate claims.',
        reconciled_catalog=index['reconciled_catalog'], competitions=rows))
    write('inventory.json', dict(files=inventory['files'], errors=inventory['errors'],
        unique_competition_ids=len({f['document']['competition_id'] for f in inventory['formats']}),
        distinct_documents=len(inventory['formats']),
        formats=[dict(sha256=f['sha256'], sources=f['sources'], competition_id=f['document']['competition_id'],
                      edition=f['document']['competition_season_id'], status=f['document']['status'],
                      notes=f['document'].get('notes'),
                      structure=[dict(key=n['key'], role=n['role'], pairing=n.get('pairing'), contest=n.get('contest'),
                                      hosting=n.get('hosting'), team_count=n.get('team_count'))
                                 for v in f['document']['variants'] for n in v['nodes']]) for f in inventory['formats']]))
    # Check the additional external documents too, not just the original 54 pins.
    changed = [f['path'] for f in inventory['files'] if hashlib.sha256(Path(f['path']).read_bytes()).hexdigest() != f['sha256']]
    assert not changed, changed
    reconciled = index['reconciled_catalog']
    assert hashlib.sha256(Path(reconciled['path']).read_bytes()).hexdigest() == reconciled['sha256']
    write('source-inventory-protection.json', dict(passed=True, checked=len(inventory['files']), reconciled_catalog_intact=True))
    print(json.dumps(dict(total=102, counts=dict(counts), external_files_intact=len(inventory['files']))))


if __name__ == '__main__':
    main()
