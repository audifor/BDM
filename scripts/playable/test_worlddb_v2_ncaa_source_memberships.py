"""Exercise read-only extraction and rejection of invalid PBM assignments."""
import importlib.util
import sqlite3
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('ncaa_source', Path(__file__).with_name('worlddb-v2-ncaa-source-memberships.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SourceMembershipTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('CREATE TABLE STA_conferences (id INTEGER, nom TEXT, id_competition INTEGER)')
        self.db.execute('CREATE TABLE STA_Equipes_Division (id INTEGER, id_equipe INTEGER, conference INTEGER, id_competition INTEGER)')
        self.db.executemany('INSERT INTO STA_conferences VALUES (?, ?, 71)', [(i, f'Conference {i}') for i in range(1, 33)])
        self.db.executemany('INSERT INTO STA_Equipes_Division VALUES (?, ?, ?, 71)', [(i, i, 1 + i % 32) for i in range(1, 352)])
        self.snapshot = {'competitions': [{'entity_id': module.NCAA}], 'manifest': {'master': {'sha256': 'source'}},
                         'clubs': [{'source_id': str(i), 'entity_id': f'pbm:DYN_equipe:{i}',
                                    'reference_data': {'nom_equipe': f'Club {i}'}} for i in range(1, 354)]}

    def tearDown(self):
        self.db.close()

    def test_preserves_source_assignments_and_leaves_missing_clubs_unassigned(self):
        result = module.extract(self.db, self.snapshot)
        self.assertEqual(len(result['assignments']), 351)
        self.assertEqual([row['teamId'] for row in result['unassigned']], ['pbm:DYN_equipe:352', 'pbm:DYN_equipe:353'])
        self.assertEqual(result['edition_status'], 'PBM_HISTORICAL_UNRECONCILED_WITH_2026_27')

    def test_rejects_duplicate_or_unknown_source_membership(self):
        self.db.execute('INSERT INTO STA_Equipes_Division VALUES (999, 1, 1, 71)')
        with self.assertRaisesRegex(ValueError, 'Invalid or duplicate'):
            module.extract(self.db, self.snapshot)


if __name__ == '__main__':
    unittest.main()
