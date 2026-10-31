"""Contracts for the read-only PBM discovery boundary."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('bridge', Path(__file__).resolve().parents[2] / 'src-tauri/resources/worlddb_v2_bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class DiscoveryTests(unittest.TestCase):
    def test_simulated_roster_shortfalls_are_filled_after_discovery(self):
        for extra in ({'formatProvenance': 'GENERATED_SIMULATION'}, {'simulationPolicy': True}):
            bridge.validate_discovery({'teamCount': 3, **extra}, [0, 4, 6])

    def test_original_participant_count_and_non_simulated_rosters_remain_required(self):
        with self.assertRaisesRegex(ValueError, 'participants'):
            bridge.validate_discovery({'teamCount': 3, 'formatProvenance': 'GENERATED_SIMULATION'}, [5, 5])
        with self.assertRaisesRegex(ValueError, 'rosters'):
            bridge.validate_discovery({'teamCount': 3}, [4, 5, 6])


if __name__ == '__main__':
    unittest.main()
