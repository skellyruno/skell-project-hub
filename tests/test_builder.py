"""Real local CMake build, state recovery, safe defaults and cancellation."""
from __future__ import annotations
import json
import tempfile
import time
from pathlib import Path
from unittest import TestCase

from desktop.builder import BuildManager, find_vst3
from desktop.launcher import valid_launch_url


def sample_project(parent):
    folder = Path(parent) / 'skell-test-project'
    folder.mkdir()
    (folder / 'CMakeLists.txt').write_text('''cmake_minimum_required(VERSION 3.15)
project(SkellBuildTest C)
include(CTest)
add_executable(skell_build_test main.c)
add_test(NAME run_test COMMAND skell_build_test)
''', encoding='utf-8')
    (folder / 'main.c').write_text('int main(void){return 0;}\n', encoding='utf-8')
    return folder


def wait_until_done(manager, timeout=25):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        current = manager.status()
        if not current['active'] and not current['queue'] and current['history']:
            return current
        time.sleep(.08)
    raise AssertionError('Build did not finish in time')


class BuildManagerTests(TestCase):
    def test_safe_defaults_validation_and_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            b = BuildManager(Path(tmp) / 'state')
            self.addCleanup(b.shutdown)
            self.assertFalse(b.status()['schedule']['enabled'])
            self.assertFalse(b.start(['unknown'])['ok'])
            self.assertFalse(b.link_folder('../escaped', tmp)['ok'])
            self.assertFalse(b.link_folder('p1', tmp)['ok'])
            project = sample_project(tmp)
            self.assertTrue(b.link_folder('p1', str(project))['ok'])
            self.assertFalse(b.start(['p1','p1'])['ok'])
            self.assertFalse(b.set_schedule('p1',1,True,True)['ok'])
            self.assertTrue(b.set_schedule('p1',60,True,True)['ok'])
            self.assertTrue(b.set_schedule('',120,True,False)['ok'])
            self.assertTrue((Path(tmp)/'state'/'builder-state.json').is_file())
            b.shutdown()
            restarted=BuildManager(Path(tmp)/'state')
            try:
                self.assertIn('p1', restarted.status()['folders'])
                self.assertFalse(restarted.status()['schedule']['enabled'])
            finally:
                restarted.shutdown()

    def test_real_cmake_build_with_ctest_and_no_fake_vst3_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = sample_project(tmp)
            b = BuildManager(Path(tmp)/'state')
            try:
                self.assertTrue(b.link_folder('demo',str(project))['ok'])
                self.assertTrue(b.start(['demo'],True)['ok'])
                result = wait_until_done(b)
                record=result['history'][0]
                self.assertEqual(record['status'],'compiled', result['logs'])
                self.assertEqual(record['configure_exit'],0)
                self.assertEqual(record['compile_exit'],0)
                self.assertEqual(record['ctest_exit'],0)
                self.assertFalse(record['artifact_verified'])
                self.assertEqual(record['vst3_binaries'],[])
                self.assertTrue((project/'.skell-build').is_dir())
            finally:
                b.shutdown()

    def test_binary_verification_requires_actual_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            plugin=root/'Example.vst3'/'Contents'/'x86_64-win'
            plugin.mkdir(parents=True)
            file=plugin/'Example.vst3'
            file.write_bytes(b'abcd')
            self.assertFalse(find_vst3(root))
            file.write_bytes(b'\0'*8192)
            self.assertEqual(len(find_vst3(root)),1)

    def test_only_fixed_launcher_url_is_allowed(self):
        self.assertTrue(valid_launch_url('skellprojecthub://open'))
        self.assertTrue(valid_launch_url('skellprojecthub://open/'))
        for value in ('skellprojecthub://build','skellprojecthub://open?cmd=delete',
                      'skellprojecthub://open/../../delete','https://example.com'):
            self.assertFalse(valid_launch_url(value))

class InstallerTests(TestCase):
    def test_install_and_rollback_preserve_existing_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            source=sample_project(tmp)
            created=source/'.skell-build'/'MyPlugin.vst3'/'Contents'/'x86_64-win'
            created.mkdir(parents=True)
            (created/'MyPlugin.vst3').write_bytes(b'new' * 2048)
            destination=root/'installed'
            old=destination/'MyPlugin.vst3'/'Contents'/'x86_64-win'
            old.mkdir(parents=True)
            (old/'MyPlugin.vst3').write_bytes(b'old' * 2048)
            b=BuildManager(root/'state')
            try:
                self.assertTrue(b.link_folder('my-plugin',str(source))['ok'])
                b._history=[{'project_id':'my-plugin','status':'compiled','artifact_verified':True,
                             'vst3_binaries':['MyPlugin.vst3/Contents/x86_64-win/MyPlugin.vst3']}]
                self.assertFalse(b.install_artifact('my-plugin',str(destination),False)['ok'])
                installed=b.install_artifact('my-plugin',str(destination),True)
                self.assertTrue(installed['ok'], installed)
                self.assertTrue(installed['backup_saved'])
                self.assertEqual((old/'MyPlugin.vst3').read_bytes(),b'new' * 2048)
                self.assertFalse(b.rollback_install('my-plugin',False)['ok'])
                restored=b.rollback_install('my-plugin',True)
                self.assertTrue(restored['ok'],restored)
                self.assertEqual((old/'MyPlugin.vst3').read_bytes(),b'old' * 2048)
                self.assertTrue(Path(restored['newer_copy']).exists())
            finally:
                b.shutdown()
