"""Publish successful batch connections to the shared NEW GAME/Rust catalog.

No UI or Rust match statement changes per competition. Native acceptance is an
explicit evidence input, never inferred from a domain test or a document status.
"""
import argparse
import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument('--results', default='.worlddb-v2/batch-04/native-results.json')
    parser.add_argument('--native-evidence', action='append', default=[])
    parser.add_argument('--output', default='src/data/worlddb-v2/competitions.json')
    parser.add_argument('--candidates', action='store_true', help='QA catalog after engine checks, before native certification; never declares PLAYABLE')
    args = parser.parse_args()
    results = read(args.results)['results']
    rows = {r['source_id']: r for r in results}
    previous = read(BASE / 'docs/playable/evidence/worlddb-v2-03/compatibility.json')
    certified = {r['source_id'] for r in previous['competitions'] if r['status'] == 'PLAYABLE'}
    required = {'native-new-game-league-club', 'original-roster', 'real-match-acta-standings',
                'contact-offer-governance-sign', 'renew-original-contract', 'close-load-continue'}
    for path in args.native_evidence:
        proof = read(path)
        steps = proof['steps']
        if not required <= {s['name'] for s in steps} or not all(s['status'] == 'PASS' for s in steps):
            raise ValueError('Incomplete Windows acceptance: ' + path)
        certified.add(proof['competition'])
    families = {rows[key]['family_signature'] for key in certified if key in rows and rows[key].get('family_signature')}
    successful = {}
    for row in results:
        accepted = row['source_id'] in certified or row.get('family_signature') in families
        if row.get('minimum_flow') != 'PASS' or not (accepted or args.candidates):
            continue
        config = dict(row['config'])
        config.pop('nativeStatus', None)
        if not accepted:
            config['nativeStatus'] = 'CANDIDATE_NATIVE_PENDING'
        successful[row['source_id']] = config
    # Preserve established ordering and defaults. Remaining successful rows enter
    # automatically from their batch data, without editing a selector by hand.
    old = read(BASE / 'src/data/worlddb-v2/competitions.json')
    order = [c['sourceCompetitionId'] for c in old if c['sourceCompetitionId'] in successful]
    order += sorted(set(successful) - set(order))
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps([successful[key] for key in order], ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(published=len(order), source_ids=order, output=str(destination), qa_candidates=args.candidates)))


if __name__ == '__main__':
    main()
