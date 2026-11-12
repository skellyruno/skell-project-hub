"""Native code behavior tests (can run without WebView2 on CI/Linux)."""
import json
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from desktop.main import Bridge, self_test
from desktop.storage import WorkspaceStore
from desktop.world import discover
from desktop.world_summary import WorldSummaryBridge


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

    def test_previous_backup_is_latest_revision(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            store = WorkspaceStore(root)
            original = json.loads(DATA)
            self.assertTrue(store.save_workspace(json.dumps(original))["ok"])
            original["projects"][0]["id"] = "revision-two"
            revision_two = json.dumps(original)
            self.assertTrue(store.save_workspace(revision_two)["ok"])
            original["projects"][0]["id"] = "revision-three"
            self.assertTrue(store.save_workspace(json.dumps(original))["ok"])
            # The recoverable previous revision must be the *second*, not the first.
            (root / "workspace.json").write_text("{broken", encoding="utf-8")
            self.assertTrue(store.load()["recovered"])
            self.assertEqual(store.load()["workspace"], revision_two)
            # Repairing the primary file must not replace the valid recovery copy
            # with bytes from the corrupted primary.
            self.assertTrue(store.save_workspace(revision_two)["ok"])
            self.assertEqual(store.load()["workspace"], revision_two)

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

class WorldSummaryBridgeTests(TestCase):
    def test_opt_in_count_only_and_revoke(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            store = WorkspaceStore(root / "project")
            share = WorldSummaryBridge(store, root / "world")
            bridge = Bridge(store, share)
            self.assertFalse(share.enabled())
            self.assertFalse(share.summary_path.exists())
            self.assertTrue(bridge.save_workspace(DATA)["ok"])
            self.assertFalse(share.summary_path.exists())  # default private

            result = bridge.set_world_summary_sharing(True)
            self.assertTrue(result["ok"])
            self.assertTrue(result["published"])
            exported = json.loads(share.summary_path.read_text(encoding="utf-8"))
            self.assertEqual(exported["schema"], "skellworld-projecthub-summary/1")
            self.assertEqual(exported["counts"]["projects"], 1)
            self.assertEqual(exported["counts"]["ci_unknown"], 1)
            self.assertNotIn("p", exported)
            self.assertNotIn("folder", json.dumps(exported))
            self.assertNotIn("repo", json.dumps(exported))
            self.assertNotIn("checklists", json.dumps(exported))
            self.assertLess(share.summary_path.stat().st_size, 4096)
            self.assertTrue(bridge.set_world_summary_sharing(False)["ok"])
            self.assertFalse(share.summary_path.exists())
            self.assertFalse(share.enabled())

    def test_updates_only_after_opted_in_save(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            store = WorkspaceStore(root / "store")
            share = WorldSummaryBridge(store, root / "share")
            bridge = Bridge(store, share)
            self.assertTrue(bridge.set_world_summary_sharing(True)["ok"])
            self.assertFalse(share.summary_path.exists())
            self.assertTrue(bridge.save_workspace(DATA)["ok"])
            before = json.loads(share.summary_path.read_text(encoding="utf-8"))
            raw = json.loads(DATA)
            raw["projects"][0]["ci"] = {"status": "failed", "label": "Build failed"}
            raw["projects"][0]["stage"] = "Blocked"
            self.assertTrue(bridge.save_workspace(json.dumps(raw))["ok"])
            after = json.loads(share.summary_path.read_text(encoding="utf-8"))
            self.assertEqual(before["counts"]["ci_unknown"], 1)
            self.assertEqual(after["counts"]["ci_failed"], 1)
            self.assertEqual(after["counts"]["blocked"], 1)
            self.assertFalse(bridge.set_world_summary_sharing("false")["ok"])
            self.assertTrue(share.enabled())
