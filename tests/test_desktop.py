"""Native code behavior tests (can run without WebView2 on CI/Linux)."""
import json
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from desktop.main import Bridge, self_test
from desktop.storage import WorkspaceStore
from desktop.world import discover


DATA = json.dumps({"schema": 1, "projects": [{"id": "p", "checklists": {}}],
                   "comparisons": [], "changes": [], "settings": {"lastLocalEdit": "2026-11-10T20:00:00Z"}})


class WorkspaceTests(TestCase):
    def test_saves_and_recovers(self):
        with tempfile.TemporaryDirectory() as td:
            store = WorkspaceStore(Path(td))
            self.assertTrue(store.save_workspace(DATA)["ok"])
            self.assertEqual(store.load()["workspace"], DATA)
            self.assertFalse(store.save_workspace('{"bad":true}')["ok"])
            # Save a second valid version, then recover after damaging the main file.
            updated = DATA.replace('"p"', '"p2"')
            self.assertTrue(store.save_workspace(updated)["ok"])
            (Path(td) / 'workspace.json').write_text('{corrupt', encoding='utf-8')
            self.assertEqual(store.load()["workspace"], DATA)
            self.assertTrue(store.load()["recovered"])

    def test_atomic_size_and_snapshot_limits(self):
        with tempfile.TemporaryDirectory() as td:
            store = WorkspaceStore(Path(td))
            self.assertFalse(store.save_workspace('x' * (5*1024*1024+1))["ok"])
            self.assertFalse(store.save_snapshots(json.dumps([{}]))["ok"])
            self.assertTrue(store.save_snapshots(json.dumps([{"at":"2026", "data":"{}"}]))["ok"])
            self.assertIsNone(store.load()["workspace"])
            self.assertEqual(len(json.loads(store.load()["snapshots"])), 1)
            self.assertEqual(list(Path(td).glob('*.tmp')), [])

    def test_bridge_rejects_missing_folder(self):
        with tempfile.TemporaryDirectory() as td:
            bridge = Bridge(WorkspaceStore(Path(td)))
            self.assertFalse(bridge.open_project_folder('').get('ok'))
            self.assertFalse(bridge.open_project_folder(str(Path(td) / 'doesnotexist')).get('ok'))

    def test_assets_self_test(self):
        self.assertEqual(self_test(), 0)


class WorldDiscoveryTests(TestCase):
    def test_missing_world_is_safe(self):
        with patch('desktop.world._request', side_effect=ConnectionRefusedError()):
            self.assertFalse(discover()['online'])

    def test_valid_world_is_informational_only(self):
        def response(path, schema):
            if path == '/api/status':
                return {"schema":schema,"peers":[{"product_id":"skell.quickstart","display_name":"Demo","untrusted_command":"DELETE"}]}
            return {"schema":schema,"plugins":[{"repository":"skellyruno/skell-vst-template","product_id":"skell.quickstart","integration":"world-demo","execute":"oops"}]}
        with patch('desktop.world._request', side_effect=response):
            result=discover()
            self.assertTrue(result['online'])
            self.assertEqual(result['peer_count'], 1)
            self.assertNotIn('untrusted_command',result['peers'][0])
            self.assertNotIn('execute',result['catalog'][0])
