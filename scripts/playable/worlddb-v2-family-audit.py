"""Second-pass dependency matrix; documentary structures are never treated as playable rules."""
import json
from collections import Counter
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
DATA = BASE / 'scripts/playable/worlddb-v2-family-dependencies.json'
OUT = BASE / 'docs/playable/evidence/worlddb-v2-04'


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def main():
    rules = read(DATA)
    matrix = read(OUT / 'compatibility.json')
    rows = matrix['competitions']
    partial = {row['source_id'] for row in rows if row['status'] == 'PARTIAL_CONNECTION'}
    assert partial == set(rules['competitions']), 'Review the family annotations when the partial set changes'
    affected = {key: sorted(source for source, entry in rules['competitions'].items() if key in entry['dependencies'] or key in entry.get('connected_capabilities', [])) for key in rules['capabilities']}
    families = []
    for key, spec in rules['capabilities'].items():
        ids = affected[key]
        # Every currently partial league has additional listed dependencies;
        # this is a measured current result, not a projection of future data.
        sole = [source for source in ids if len(rules['competitions'][source]['dependencies']) == 1]
        families.append(dict(id=key, **spec, partial_competitions=ids, affected_count=len(ids),
                             verified_playable_by_fixing_only_this=0, remaining_dependencies_are_independent=True,
                             sole_listed_dependency=sole))
        assert not sole, f'Reassess isolated unlocks for {key}: {sole}'
    output = []
    for row in rows:
        snapshot = read(BASE / row['snapshotPath']) if row.get('snapshotPath') else None
        source_data = None if snapshot is None else dict(
            scope='Runtime V1 original population selected for this source competition and start date',
            clubs=len(snapshot['clubs']), original_players_selected=sum(p['source_table'] == 'DYN_joueur' for p in snapshot['people']),
            original_staff_selected=sum(p['source_table'] == 'DYN_person' for p in snapshot['people']),
            selected_free_agents=len(snapshot.get('freeAgents', [])),
            inherited_issue_codes=sorted({i['code'] for i in snapshot['manifest']['issues']}))
        spec = rules['competitions'].get(row['source_id'])
        selected = row.get('reconciled_evidence', [])
        documented = [dict(identity=e['competition_id_canonico'], status=e.get('clasificacion_formato_reconciliado'),
                           sources=e.get('fuente_oficial'), missing_fields=e.get('reglas_pendientes'))
                      for e in selected if e['competition_id_canonico'] == row['config']['nativeCompetitionId']]
        dependencies = [] if spec is None else [dict(id=key, name=rules['capabilities'][key]['name'],
                           affects_other_partial_competitions=[source for source in affected[key] if source != row['source_id']])
                           for key in spec['dependencies']]
        country = row['config']['countryCode']
        evidence_candidates = [OUT / ('native-' + country + '.json'), OUT / ('season-' + country + '.json'),
            OUT.parent / 'worlddb-v2-03' / ('native-' + country) / 'acceptance.json',
            OUT.parent / 'worlddb-v2-03f' / ('season-' + country + '.json')]
        tested_evidence = [str(path.relative_to(OUT.parent)).replace('\\', '/') for path in evidence_candidates
                           if path.exists() and read(path).get('competition') == row['source_id']]
        native_id = row['config']['nativeCompetitionId']
        output.append(dict(source_id=row['source_id'], competition=row['name'], status=row['status'],
            pbm=source_data, original_club_ids_preserved=row['source_build'] == 'PASS',
            native_format_id=None if native_id.startswith('UNMAPPED:') else native_id,
            format_evidence_kind='RUNTIME_DOCUMENT' if row['candidate_formats'] else 'RESEARCH_METADATA' if documented else 'UNVERIFIED',
            format_documents=row['candidate_formats'], official_documentary_evidence=documented,
            minimum_flow=row['minimum_flow'], native_blocker=row['missing_dependency'],
            shared_capabilities=dependencies, connected_shared_capabilities=[] if spec is None else spec.get('connected_capabilities', []), detailed_blocker=None if spec is None else spec['detail'],
            next_action=row.get('next_action'), identity_evidence=row['identityEvidence'], tested_evidence=tested_evidence,
            evidence_reference='compatibility.json: ' + row['source_id']))
    assert len(output) == 102
    result = dict(total=102, status_counts=dict(Counter(row['status'] for row in output)),
                  partial_total=len(partial), verified_additional_playable=0,
                  interpretation='Counts show affected partial competitions; they are not additive and a single capability does not resolve the other missing contracts or evidence.',
                  families=families, competitions=output)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'family-matrix.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(total=len(output), status_counts=result['status_counts'], verified_additional_playable=0,
                          affected={item['id']: item['affected_count'] for item in families})))


if __name__ == '__main__':
    main()
