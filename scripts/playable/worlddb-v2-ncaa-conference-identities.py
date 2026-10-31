"""Match PBM conference identities to BDM references, without transferring season rules."""
import argparse
import json
from pathlib import Path

# PBM STA_conferences.id -> (source name, BDM conference slug). The WAC has no
# corresponding basketball format in the reference bundle: UAC is not the WAC.
IDENTITIES = {
    2: ('Atlantic 10 Conference', 'atlantic-10'), 3: ('Atlantic Coast Conference', 'acc'),
    4: ('America East Conference', 'america-east'), 5: ('Big East Conference', 'big-east'),
    6: ('Big Sky Conference', 'big-sky'), 7: ('Big South Conference', 'big-south'),
    8: ('Big Ten Conference', 'big-ten'), 9: ('Big 12 Conference', 'big-12'),
    10: ('Big West Conference', 'big-west'), 11: ('Colonial Athletic Conference', 'caa'),
    12: ('Conference USA', 'cusa'), 13: ('Horizon League', 'horizon'),
    14: ('Ivy League', 'ivy'), 15: ('Metro Atlantic Athletic Conference', 'maac'),
    16: ('Mid-American Conference', 'mac'), 17: ('Mid-Eastern Athletic Conference', 'meac'),
    18: ('Missouri Valley', 'mvc'), 19: ('Mountain West', 'mountain-west'),
    20: ('Northeast', 'nec'), 21: ('Ohio Valley', 'ovc'), 22: ('Pacific-12', 'pac-12'),
    23: ('Patriot League', 'patriot'), 24: ('South Eastern Conference', 'sec'),
    25: ('Southern', 'southern'), 26: ('Southland', 'southland'),
    27: ('South Western Athletic Conference', 'swac'), 28: ('Summit', 'summit'),
    29: ('Sun Belt', 'sun-belt'), 30: ('West Coast Conference', 'wcc'),
    31: ('Western Athletic Conference', None), 32: ('Atlantic Sun Conference', 'asun'),
    33: ('American Athletic Conference', 'american'),
}
PREFIX = 'competition:USA:ncaa-d1-men:'
CAA_RENAME = 'https://caasports.com/news/2023/7/20/football-caa-changes-official-conference-name-to-coastal-athletic-association.aspx'


def reconcile(source, plan):
    if source.get('source_competition_id') != 'pbm:DYN_championnat:71' or plan.get('source_competition_id') != source['source_competition_id']:
        raise ValueError('NCAA source mismatch')
    source_conferences = {row['sourceConferenceId']: row['name'] for row in source['conferences']}
    if len(source_conferences) != len(source['conferences']) or set(source_conferences) != set(IDENTITIES):
        raise ValueError('Unexpected or duplicate PBM conference identities')
    reference_rows = plan['conference_formats']
    references = {row['reference_competition']: row for row in reference_rows}
    if len(references) != 32 or len(reference_rows) != 32:
        raise ValueError('Expected 32 distinct BDM reference conferences')
    rows = []
    for identity, (expected_name, slug) in IDENTITIES.items():
        if source_conferences[identity] != expected_name:
            raise ValueError('PBM conference name does not match its expected identity')
        reference = PREFIX + slug if slug else None
        if reference is not None and reference not in references:
            raise ValueError('BDM conference reference is missing: ' + reference)
        rows.append({'sourceConferenceId': identity, 'sourceName': expected_name,
                     'referenceCompetition': reference,
                     'identityEvidence': CAA_RENAME if identity == 11 else 'PBM conference name',
                     'rulesCompatibility': 'UNVERIFIED_DIFFERENT_EDITION'})
    matched = {row['referenceCompetition'] for row in rows if row['referenceCompetition']}
    if len(matched) != 31:
        raise ValueError('Duplicate or missing conference identity mapping')
    return {'source_competition_id': source['source_competition_id'], 'master_sha256': source['master_sha256'],
            'reference_edition': plan['reference_edition'], 'source_edition': 'UNVERIFIED',
            'identity_matches': rows, 'unmatched_reference_competitions': sorted(set(references) - matched),
            'unassigned_original_clubs': source['unassigned'],
            'status': 'IDENTITIES_ONLY_RULES_AND_MEMBERSHIPS_NOT_RECONCILED'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    source, plan = [json.loads(p.read_text(encoding='utf-8-sig')) for p in (args.source, args.plan)]
    result = reconcile(source, plan)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as output:
        json.dump(result, output, ensure_ascii=False, indent=2)
        output.write('\n')
    print(json.dumps({'matched': sum(row['referenceCompetition'] is not None for row in result['identity_matches']),
                      'unmatched_reference': result['unmatched_reference_competitions'],
                      'unassigned_original_clubs': result['unassigned_original_clubs']}))


if __name__ == '__main__':
    main()
