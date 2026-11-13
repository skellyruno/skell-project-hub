"""Windows: exercise the actual CMake -> PE -> install path, without a DAW.

The generated dummy module is not a real VST3 plugin. It only proves the native
Windows compiler, PE verification, SHA-256 provenance and safe installer plumbing.
"""
from __future__ import annotations
import os
from pathlib import Path
import shutil
import tempfile
import time
import unittest

from desktop.builder import BuildManager, sha256_file, vst3_binary_kind

def wait_until_done(manager, timeout=55):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = manager.status()
        if not result['active'] and not result['queue'] and result['history']:
            return result
        time.sleep(.1)
    raise AssertionError('Windows CMake proof build timed out')


@unittest.skipUnless(os.name == 'nt' and shutil.which('cmake'), 'Requires Windows and CMake')
class WindowsNativeBuildSmoke(unittest.TestCase):
    def test_native_pe_module_build_and_install(self):
        with tempfile.TemporaryDirectory() as work, tempfile.TemporaryDirectory() as destination:
            root = Path(work)
            project = root / 'cmake-vst3-probe'
            project.mkdir()
            (project / 'CMakeLists.txt').write_text('''cmake_minimum_required(VERSION 3.15)
project(SkellBinaryProof C)
add_library(skell_binary_proof MODULE dummy.c)
set_target_properties(skell_binary_proof PROPERTIES PREFIX "" SUFFIX ".vst3")
''', encoding='utf-8')
            (project / 'dummy.c').write_text(
                '__declspec(dllexport) int skell_binary_proof(void) { return 42; }\n',
                encoding='utf-8')
            manager = BuildManager(root / 'state')
            try:
                self.assertTrue(manager.link_folder('dummy-pe', str(project))['ok'])
                self.assertTrue(manager.start(['dummy-pe'], with_tests=False)['ok'])
                result = wait_until_done(manager, timeout=55)
                history = result['history'][0]
                self.assertEqual(history['status'], 'compiled', result['logs'])
                self.assertTrue(history['artifact_verified'], history)
                self.assertTrue(history['sha256'])
                binary_rel = history['vst3_binaries'][0]
                binary = project / '.skell-build' / binary_rel
                self.assertEqual(vst3_binary_kind(binary), 'PE')
                self.assertEqual(sha256_file(binary), history['sha256'][binary_rel])
                installed = manager.install_artifact('dummy-pe', destination, confirmed=True)
                self.assertTrue(installed['ok'], installed)
                installed_file = Path(installed['installed'])
                self.assertTrue(installed_file.is_file())
                self.assertEqual(sha256_file(installed_file), history['sha256'][binary_rel])
            finally:
                manager.shutdown()
