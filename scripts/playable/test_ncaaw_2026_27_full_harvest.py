import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('harvest', Path(__file__).with_name('ncaaw_2026_27_full_harvest.py'))
harvest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harvest)

class VerifiedDuplicateTests(unittest.TestCase):
    def test_only_evidenced_duplicate_is_removed_with_provenance(self):
        row = {'date': '2026-11-11', 'homeProgramId': 'ncaa:2026-27:women:depaul-blue-demons',
               'awayProgramId': 'ncaa:2026-27:women:northern-illinois-huskies'}
        events = {'401913047': dict(row), '401919967': dict(row)}
        excluded = []
        harvest.resolve_verified_duplicate(events, excluded)
        self.assertEqual(set(events), {'401919967'})
        self.assertEqual(excluded[0]['supersededBy'], '401919967')
        self.assertEqual(len(excluded[0]['evidence']), 3)

    def test_changed_facts_fail_closed(self):
        row = {'date': '2026-11-12', 'homeProgramId': 'ncaa:2026-27:women:depaul-blue-demons',
               'awayProgramId': 'ncaa:2026-27:women:northern-illinois-huskies'}
        with self.assertRaisesRegex(ValueError, 'has changed'):
            harvest.resolve_verified_duplicate({'401913047': dict(row), '401919967': dict(row)}, [])

    def test_official_schedule_corrects_date_and_neutral_venue_with_evidence(self):
        row = {'date': '2026-11-23', 'homeProgramId': 'ncaa:2026-27:women:grand-canyon-lopes',
               'awayProgramId': 'ncaa:2026-27:women:winthrop-eagles'}
        high_point = {'date': '2026-11-25', 'homeProgramId': 'ncaa:2026-27:women:high-point-panthers',
                      'awayProgramId': 'ncaa:2026-27:women:grand-canyon-lopes'}
        events = {'401915901': dict(row), '401921390': dict(row), '401921391': high_point}
        excluded = []
        harvest.resolve_verified_duplicate(events, excluded)
        self.assertEqual(events['401921390']['date'], '2026-11-25')
        self.assertTrue(events['401921390']['neutralSite'])
        self.assertEqual(events['401921390']['sourceCorrection']['originalDate'], '2026-11-23')
        self.assertEqual(events['401921391']['date'], '2026-11-23')
        self.assertTrue(events['401921391']['neutralSite'])
        self.assertEqual(excluded[0]['supersededBy'], '401921390')

    def test_stanford_correction_is_independent_of_duplicate_ids(self):
        events = {'401915984': {'date': '2026-11-29',
            'homeProgramId': 'ncaa:2026-27:women:stanford-cardinal',
            'awayProgramId': 'ncaa:2026-27:women:columbia-lions'}}
        harvest.resolve_verified_duplicate(events, [])
        self.assertEqual(events['401915984']['date'], '2026-11-27')
        self.assertTrue(events['401915984']['neutralSite'])

if __name__ == '__main__':
    unittest.main()
