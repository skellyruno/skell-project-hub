"""Regression tests for Windows pythonnet initialization."""
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch
from desktop.runtime_check import DLL_RELATIVE_PATH, bundled_runtime_check, download_zone, probe_pythonnet


class RuntimeDiagnosticsTests(TestCase):
    def test_missing_library(self):
        with tempfile.TemporaryDirectory() as temp:
            result = bundled_runtime_check(Path(temp), platform='win32')
            self.assertFalse(result['ok'])
            self.assertEqual(result['reason'], 'missing')

    def test_download_flag_and_repair_instructions(self):
        with tempfile.TemporaryDirectory() as temp:
            dll = Path(temp) / DLL_RELATIVE_PATH
            dll.parent.mkdir(parents=True)
            dll.write_bytes(b'test')
            Path(str(dll) + ':Zone.Identifier').write_text('[ZoneTransfer]\nZoneId=3\n')
            self.assertEqual(download_zone(dll, platform='win32'), 3)
            result = bundled_runtime_check(Path(temp), platform='win32')
            self.assertEqual(result['reason'], 'blocked')
            self.assertIn('Repair-Project-Hub.cmd', result['message'])
            self.assertTrue(bundled_runtime_check(Path(temp), platform='linux')['ok'])

    def test_unblocked_library_and_nonwindows(self):
        with tempfile.TemporaryDirectory() as temp:
            dll = Path(temp) / DLL_RELATIVE_PATH
            dll.parent.mkdir(parents=True)
            dll.write_bytes(b'test')
            self.assertTrue(bundled_runtime_check(Path(temp), platform='win32')['ok'])
            self.assertTrue(probe_pythonnet(platform='linux')['ok'])

    def test_exact_pythonnet_error_is_reported(self):
        import builtins
        original = builtins.__import__
        def fake(name, *args, **kwargs):
            if name == 'clr':
                raise RuntimeError('Failed to resolve Python.Runtime.Loader.Initialize')
            return original(name, *args, **kwargs)
        with patch('builtins.__import__', side_effect=fake):
            result = probe_pythonnet(platform='win32', frozen=False)
        self.assertEqual(result['reason'], 'load-failed')
        self.assertIn('Python.Runtime.Loader.Initialize', result['message'])
