"""Publish successful batch connections to the shared NEW GAME/Rust catalog.

No UI or Rust match statement changes per competition. Native acceptance is an
explicit evidence input, never inferred from a domain test or a document status.
"""
import argparse
import json
import hashlib
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def publish_validated_families(directory):
    """Publish engine-playable simulation families without claiming Windows QA.

    Each source cohort must pass bootstrap and Save V4; each execution family
    must complete real Match Next games, postseason and successor generation.
    Original native-certified entries remain in their existing catalog.
    """
    directory = Path(directory)
    validation = {row['id']: row for row in read(directory / 'global-validation.json')}
    families = [read(path) for path in sorted(directory.glob('family-*.json'))]
    signatures = {row['signature'] for row in families if row['status'] == 'LIFECYCLE_PASS'}
    documents = {doc['competition_season_id']: doc for name in ['simulation-formats.json', 'reused-documented-formats.json'] for doc in read(directory / name)}
    configs, formats = [], []
    for config in read(directory / 'candidate-competitions.json'):
        proof = validation.get(config['sourceCompetitionId'], {})
        if proof.get('status') != 'PROJECTION_SAVE_PASS' or proof.get('signature') not in signatures:
            continue
        document = documents[config['editionId']]
        if document['status'] != 'COMPLETE':
            raise ValueError('Only executable formats can be published')
        configs.append({**config, 'nativeStatus': 'FAMILY_TESTED_INDIVIDUAL_SEASON_AND_WINDOWS_PENDING'})
        formats.append(document)
    if not configs:
        raise ValueError('No matching source and lifecycle evidence')
    target = BASE / 'src/data/worlddb-v2'
    for name, rows in [('global-competitions.json', configs), ('global-formats.json', formats)]:
        (target / name).write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report = {'original_native_certified': len(read(target / 'competitions.json')), 'new_family_candidates': len(configs),
              'generated': sum(c['formatProvenance'] == 'GENERATED_SIMULATION' for c in configs),
              'adapted': sum(c.get('simulationPolicy') is True for c in configs),
              'pending': [r for r in validation.values() if r['id'] not in {c['sourceCompetitionId'] for c in configs}],
              'validation': list(validation.values()), 'families': families,
              'windows_acceptance': 'NOT_RUN_FOR_NEW_ENTRIES',
              'format_sha256': hashlib.sha256((target / 'global-formats.json').read_bytes()).hexdigest()}
    evidence = BASE / 'docs/playable/evidence/worlddb-global-functional.json'
    evidence.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: report[k] for k in ['original_native_certified', 'new_family_candidates', 'generated', 'adapted']}))


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument('--results', default='.worlddb-v2/batch-04/native-results.json')
    parser.add_argument('--native-evidence', action='append', default=[])
    parser.add_argument('--output', default=None)
    parser.add_argument('--candidates', action='store_true', help='QA catalog after engine checks, before native certification; never declares PLAYABLE')
    parser.add_argument('--family-package', help='Publish simulation families with source/save and full lifecycle evidence; Windows QA remains separate')
    args = parser.parse_args()
    if args.family_package:
        publish_validated_families(args.family_package)
        return
    output = args.output or ('.worlddb-v2/batch-04/candidate-competitions.json'
                             if args.candidates else 'src/data/worlddb-v2/competitions.json')
    if args.candidates and Path(output).resolve() == (BASE / 'src/data/worlddb-v2/competitions.json').resolve():
        raise ValueError('QA candidate catalog must not overwrite the public NEW GAME catalog')
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
        provenance = row.get('config', {}).get('formatProvenance')
        generated = row.get('format_mode') == 'GENERATED_SIMULATION_CANDIDATE' or provenance == 'GENERATED_SIMULATION'
        reused_documented = row.get('format_mode') == 'REUSED_DOCUMENTED_FORMAT_CANDIDATE' or provenance == 'REUSED_DOCUMENTED_FORMAT'
        # A documented format is NOT an engine adapter or Windows acceptance.
        # Neither reused candidates nor generated ones inherit certification
        # from another competition that happens to share their family signature.
        requires_individual_acceptance = generated or reused_documented
        accepted = (row['source_id'] in certified and row.get('market_flow') == 'PASS') if requires_individual_acceptance \
            else (row['source_id'] in certified or row.get('family_signature') in families)
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
    destination = Path(output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps([successful[key] for key in order], ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(published=len(order), source_ids=order, output=str(destination), qa_candidates=args.candidates)))


if __name__ == '__main__':
    main()
