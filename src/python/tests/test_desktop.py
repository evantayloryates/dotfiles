import json
import os
import sys
import tempfile
import unittest
from unittest import mock


sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import desktop  # noqa: E402


class DesktopGridTests(unittest.TestCase):
    def test_axis_step_uses_snapped_samples(self):
        # Repeated results and skipped cells are normal when sample targets
        # land nearer the same grid slot.
        values = [57, 57, 179, 301, 301, 545, 667]
        self.assertEqual(desktop._axis_step(values, 24), 122)

    def test_axis_step_rejects_corrupt_tiny_lattice(self):
        with self.assertRaisesRegex(desktop.DesktopError, 'implausible'):
            desktop._axis_step([39, 57, 161, 179], 24)

    def test_probe_targets_stay_inside_primary_display(self):
        screen = desktop.Screen(
            desktop.Frame(desktop.Point(0, 0), desktop.Rect(1512, 982)),
            desktop.Frame(desktop.Point(0, 34), desktop.Rect(1512, 948)),
            True,
        )
        targets, horizontal_count = desktop._probe_targets(screen, 24)
        self.assertEqual(horizontal_count, 13)
        self.assertTrue(all(screen.frame.contains(point) for point in targets))
        self.assertEqual(targets[0].x, 12)
        self.assertEqual(targets[-1].y, 970)

    def test_measure_grid_ignores_other_display_coordinates(self):
        primary = desktop.Screen(
            desktop.Frame(desktop.Point(0, 0), desktop.Rect(1512, 982)),
            desktop.Frame(desktop.Point(0, 34), desktop.Rect(1512, 948)),
            True,
        )
        external = desktop.Screen(
            desktop.Frame(desktop.Point(-970, -1440), desktop.Rect(3440, 1440)),
            desktop.Frame(desktop.Point(-970, -1440), desktop.Rect(3440, 1440)),
            False,
        )
        snap = desktop.Snapshot(
            desktop.Rect(3440, 2422),
            '24|snap to grid|right',
            [
                desktop.DesktopItem('probe', desktop.Point(-83, -96)),
                desktop.DesktopItem('primary item', desktop.Point(1399, 939)),
            ],
            [primary, external],
        )
        horizontal = [desktop.Point(x, 497) for x in
                      [57, 179, 301, 423, 545, 667, 789, 911, 1033,
                       1155, 1277, 1399, 1399]]
        vertical = [desktop.Point(789, 55 + 34 * row) for row in range(21)]
        edges = [desktop.Point(57, 55), desktop.Point(1399, 939)] * 6

        with mock.patch.object(desktop, '_probe_many',
                               return_value=horizontal + vertical + edges):
            grid = desktop.measure_grid(snap, 'probe')

        self.assertEqual(grid, desktop.Grid(
            desktop.Point(57, 55), desktop.Point(122, 34), 12, 27,
        ))

    def test_version_one_and_tiny_caches_are_rejected(self):
        signature = 'test'
        base = {
            'signature': signature,
            'grid': {'origin': [57, 55], 'step': [122, 34],
                     'cols': 12, 'rows': 27},
        }
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, 'grid.json')
            with mock.patch.object(desktop, 'CACHE_PATH', path):
                with open(path, 'w', encoding='utf-8') as handle:
                    json.dump(base, handle)
                self.assertIsNone(desktop._read_cache(signature))

                base['version'] = desktop._CACHE_VERSION
                base['grid']['step'] = [2, 1]
                with open(path, 'w', encoding='utf-8') as handle:
                    json.dump(base, handle)
                self.assertIsNone(desktop._read_cache(signature))


if __name__ == '__main__':
    unittest.main()
