"""Windows CI proves registration, ownership enforcement, and cleanup."""
import sys
import tempfile
import unittest
from pathlib import Path
from desktop.launcher import KEY,register,registration_state,valid_launch_url

@unittest.skipUnless(sys.platform=="win32","Windows-only")
class LauncherTests(unittest.TestCase):
    def test_protocol_roundtrip(self):
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,KEY):
                self.skipTest("Preexisting protocol; no modification permitted")
        except FileNotFoundError:
            pass
        with tempfile.TemporaryDirectory() as folder:
            exe=Path(folder)/"Skell Project Hub.exe"
            exe.write_bytes(b"MZ"+bytes(200))
            try:
                self.assertTrue(register(exe)["ok"])
                self.assertTrue(registration_state(exe)["registered"])
                self.assertFalse(register(Path(folder)/"wrong.exe",unregister=True)["ok"])
                self.assertTrue(register(exe,unregister=True)["ok"])
                self.assertFalse(registration_state(exe)["registered"])
                self.assertFalse(valid_launch_url("skellprojecthub://build"))
            finally:
                if registration_state(exe)["registered"]:
                    register(exe,unregister=True)
