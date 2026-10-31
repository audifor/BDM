"""Extract PBM's NCAA conference assignments without changing the source database.

This is historical source evidence, not an assignment to the 2026-27 BDM formats.
"""
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path

NCAA = 'pbm:DYN_championnat:71'


def extract(connection, snapshot):
    if {c['entity_id'] for c in snapshot['competitions']} != {NCAA}:
        raise ValueError('Expected the original NCAA snapshot')
    clubs = {int(c['source_id']): c for c in snapshot['clubs']}
    if len(clubs) != 353:
        raise ValueError('Expected 353 unique NCAA clubs')
    conferences = {row[0]: row[1] for row in connection.execute(
        'SELECT id, nom FROM STA_conferences WHERE id_competition = 71')}
    if len(conferences) != 32:
        raise ValueError('Expected 32 PBM conference identities')
    assignments = []
    seen = set()
    for team, conference, row_id in connection.execute(
        'SELECT id_equipe, conference, id FROM STA_Equipes_Division WHERE id_competition = 71'):
        if team not in clubs or team in seen or conference not in conferences:
            raise ValueError('Invalid or duplicate PBM conference membership')
        seen.add(team)
        assignments.append({'teamId': clubs[team]['entity_id'], 'sourceConferenceId': conference,
                            'sourceConferenceName': conferences[conference],
                            'evidence': f'STA_Equipes_Division.id={row_id}'})
    return {'source_competition_id': NCAA, 'master_sha256': snapshot['manifest']['master']['sha256'],
            'edition_status': 'PBM_HISTORICAL_UNRECONCILED_WITH_2026_27',
            'conferences': [{'sourceConferenceId': k, 'name': v} for k, v in sorted(conferences.items())],
            'assignments': sorted(assignments, key=lambda row: row['teamId']),
            'unassigned': [{'teamId': c['entity_id'], 'name': c['reference_data']['nom_equipe']}
                           for team, c in sorted(clubs.items()) if team not in seen]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--master', type=Path, required=True)
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    snapshot = json.loads(args.snapshot.read_text(encoding='utf-8-sig'))
    with args.master.open('rb') as master:
        digest = hashlib.file_digest(master, 'sha256').hexdigest()
    if digest != snapshot['manifest']['master']['sha256']:
        raise ValueError('Master hash differs from snapshot')
    with sqlite3.connect(args.master.resolve().as_uri() + '?mode=ro&immutable=1', uri=True) as connection:
        result = extract(connection, snapshot)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as output:
        json.dump(result, output, ensure_ascii=False, indent=2)
        output.write('\n')
    print(json.dumps({'assigned': len(result['assignments']), 'unassigned': result['unassigned'],
                      'conferences': len(result['conferences']), 'output': str(args.output)}))


if __name__ == '__main__':
    main()
