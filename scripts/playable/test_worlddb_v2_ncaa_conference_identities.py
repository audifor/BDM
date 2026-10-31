"""Conference identity matching never substitutes later-edition rules."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('ncaa_conference_identities', Path(__file__).with_name('worlddb-v2-ncaa-conference-identities.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture():
    source = {'source_competition_id': 'pbm:DYN_championnat:71', 'master_sha256': 'source', 'unassigned': [{'teamId': 'pbm:DYN_equipe:1540'}],
              'conferences': [{'sourceConferenceId': key, 'name': value[0]} for key, value in module.IDENTITIES.items()]}
    slugs = [value[1] for value in module.IDENTITIES.values() if value[1]] + ['uac']
    plan = {'source_competition_id': source['source_competition_id'], 'reference_edition': '2026-27',
            'conference_formats': [{'reference_competition': module.PREFIX + slug} for slug in slugs]}
    return source, plan


class ConferenceIdentityTests(unittest.TestCase):
    def test_matches_identity_without_claiming_rules_or_inventing_wac(self):
        source, plan = fixture()
        result = module.reconcile(source, plan)
        self.assertEqual(sum(row['referenceCompetition'] is not None for row in result['identity_matches']), 31)
        self.assertIsNone(next(row for row in result['identity_matches'] if row['sourceConferenceId'] == 31)['referenceCompetition'])
        self.assertEqual(result['unmatched_reference_competitions'], [module.PREFIX + 'uac'])
        self.assertTrue(all(row['rulesCompatibility'] == 'UNVERIFIED_DIFFERENT_EDITION' for row in result['identity_matches']))
        self.assertEqual(result['unassigned_original_clubs'], source['unassigned'])

    def test_rejects_changed_source_identity_and_missing_reference(self):
        source, plan = fixture()
        source['conferences'][0]['name'] = 'unexpected'
        with self.assertRaisesRegex(ValueError, 'name does not match'):
            module.reconcile(source, plan)
        source, plan = fixture()
        plan['conference_formats'][0]['reference_competition'] = module.PREFIX + 'other'
        with self.assertRaisesRegex(ValueError, 'reference is missing'):
            module.reconcile(source, plan)


if __name__ == '__main__':
    unittest.main()
