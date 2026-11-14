"""Opt-in CMake developer builds. No shell, remote command, or silent installation.

Local project directories are authorized only by a native folder-picker interaction.
A build stays on the explicit project's own .skell-build directory; the app never
modifies a repository's source or user's previously configured build directory.
"""
from __future__ import annotations

import json
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Callable

try:
    from .storage import WorkspaceStore, storage_root
except ImportError:
    from storage import WorkspaceStore, storage_root

MAX_LOG_LINES = 180
MAX_HISTORY = 40
TIMEOUT_SECONDS = 25 * 60
INTERVALS = (60, 120, 240)


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def valid_project_id(value):
    return isinstance(value, str) and 0 < len(value) <= 150 and all(
        c.isalnum() or c in '-_.' for c in value)


def safe_root(folder: Path):
    path = folder.resolve(strict=True)
    if not path.is_dir() or not (path / 'CMakeLists.txt').is_file():
        raise ValueError('Choose a local project directory containing CMakeLists.txt')
    if path == Path(path.anchor) or path == Path.home():
        raise ValueError('Select an individual project, not a drive or home folder')
    return path


def vst3_binary_kind(file: Path):
    """Cheap header sanity check; not a code-signature or DAW host test."""
    try:
        if file.is_symlink() or not file.is_file() or file.stat().st_size < 4096:
            return None
        with file.open('rb') as stream:
            head = stream.read(64)
            if head[:2] == b'MZ' and len(head) >= 64:
                offset = int.from_bytes(head[0x3c:0x40], 'little')
                if 64 <= offset <= 4096:
                    stream.seek(offset)
                    # Windows VST3 modules must be x64 PE32+ images, not just
                    # arbitrary files with a DOS/PE signature or 32-bit DLLs.
                    if stream.read(4) == b'PE\0\0':
                        coff = stream.read(20)
                        if len(coff) == 20:
                            machine = int.from_bytes(coff[:2], 'little')
                            optional_size = int.from_bytes(coff[16:18], 'little')
                            if machine == 0x8664 and optional_size >= 2:
                                if stream.read(2) == b'\x0b\x02':
                                    return 'PE'
            if head[:4] == b'\x7fELF':
                return 'ELF'
            if head[:4] in (b'\xfe\xed\xfa\xce', b'\xce\xfa\xed\xfe',
                            b'\xfe\xed\xfa\xcf', b'\xcf\xfa\xed\xfe'):
                return 'Mach-O'
    except OSError:
        return None
    return None


def sha256_file(file: Path) -> str:
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def find_vst3(build: Path):
    """Return plausible non-symlink VST3 binaries, not merely named folders."""
    found = []
    if not build.is_dir():
        return found
    for base, dirs, files in os.walk(build):
        dirs[:] = [d for d in dirs if d not in ('.git', '_deps')]
        base_path = Path(base)
        for name in files:
            file = base_path / name
            if name.lower().endswith('.vst3'):
                try:
                    if vst3_binary_kind(file):
                        found.append(str(file.relative_to(build)))
                except OSError:
                    pass
            if len(found) >= 30:
                return found
    return found


class BuildManager:
    """One sequential worker and optional in-app scheduler, never a background daemon."""

    def __init__(self, root: Path | None = None, command: str = 'cmake', clock: Callable = time.time):
        self.root = Path(root) if root else storage_root()
        self._clock = clock
        self._cmd = command
        self._lock = threading.RLock()
        self._stop = threading.Event()
        self._shutdown = False
        self._thread = None
        self._process = None
        self._cancel = False
        self._queue = []
        self._active = None
        self._logs = []
        self._history = []
        self._folders = {}
        self._installs = {}
        self._schedule = {'enabled': False, 'interval_minutes': 120, 'project_id': '',
                          'with_tests': True, 'next_due': None}
        self._load()
        self._scheduler = threading.Thread(target=self._schedule_loop, daemon=True,
                                           name='SKELL Build scheduler')
        self._scheduler.start()

    def _load(self):
        try:
            raw = (self.root / 'builder-state.json').read_text(encoding='utf-8')
            obj = json.loads(raw)
            if isinstance(obj, dict):
                for pid, path in obj.get('folders', {}).items():
                    if valid_project_id(pid) and isinstance(path, str) and len(path) < 4096:
                        self._folders[pid] = path
                self._history = [h for h in obj.get('history', [])[:MAX_HISTORY]
                                 if isinstance(h, dict)]
                self._installs = {k: v for k,v in obj.get('installs', {}).items()
                                  if valid_project_id(k) and isinstance(v, dict)}
                schedule = obj.get('schedule', {})
                if isinstance(schedule, dict) and schedule.get('interval_minutes') in INTERVALS:
                    self._schedule.update({k: schedule[k] for k in self._schedule if k in schedule})
                    if not valid_project_id(self._schedule['project_id']):
                        self._schedule['enabled'] = False
                    # Do not execute overdue tasks on startup without renewed user presence.
                    if self._schedule['enabled']:
                        self._schedule['next_due'] = self._clock() + self._schedule['interval_minutes'] * 60
        except (OSError, ValueError, TypeError, AttributeError):
            pass

    def _save(self):
        state = {'schema': 1, 'folders': self._folders, 'history': self._history, 'installs': self._installs,
                 'schedule': self._schedule}
        WorkspaceStore(self.root)._atomic('builder-state.json', json.dumps(state))

    def _log(self, line):
        text = str(line).replace('\x00', '').rstrip()[:500]
        with self._lock:
            self._logs.append(text)
            self._logs = self._logs[-MAX_LOG_LINES:]

    def link_folder(self, project_id: str, folder: str):
        if not valid_project_id(project_id):
            return {'ok': False, 'error': 'Invalid project ID'}
        try:
            path = safe_root(Path(folder))
            with self._lock:
                if self._active or self._queue:
                    return {'ok': False, 'error': 'Cannot change linked folders while building'}
                self._folders[project_id] = str(path)
                self._save()
            return {'ok': True, 'folder': str(path)}
        except (OSError, ValueError, RuntimeError) as error:
            return {'ok': False, 'error': str(error)}

    def status(self):
        with self._lock:
            return {'active': dict(self._active) if self._active else None,
                    'queue': list(self._queue), 'folders': dict(self._folders),
                    'history': [dict(h) for h in self._history[:15]],
                    'installs': {k: dict(v) for k,v in self._installs.items()},
                    'logs': list(self._logs[-80:]), 'schedule': dict(self._schedule),
                    'available': shutil.which(self._cmd) is not None,
                    'shutting_down': self._shutdown}

    def start(self, project_ids: list, with_tests=True):
        """Caller must have shown confirmation for this specific project set."""
        if not isinstance(project_ids, list) or not 1 <= len(project_ids) <= 50:
            return {'ok': False, 'error': 'Choose one or more authorized projects'}
        if len(set(project_ids)) != len(project_ids) or not all(valid_project_id(p) for p in project_ids):
            return {'ok': False, 'error': 'Invalid or duplicate project identifiers'}
        if shutil.which(self._cmd) is None:
            return {'ok': False, 'error': 'CMake is not installed or missing from PATH'}
        with self._lock:
            if self._shutdown or self._active or self._queue:
                return {'ok': False, 'error': 'Another build is running'}
            try:
                for pid in project_ids:
                    if pid not in self._folders:
                        raise ValueError(f'Choose a build folder for {pid} first')
                    path = safe_root(Path(self._folders[pid]))
                    if str(path) != self._folders[pid]:
                        raise ValueError('Authorized folder changed; choose it again')
            except (OSError, ValueError) as error:
                return {'ok': False, 'error': str(error)}
            self._queue = list(project_ids)
            self._cancel = False
            self._logs = []
            self._thread = threading.Thread(target=self._run_queue, args=(bool(with_tests),),
                                            name='SKELL CMake builder', daemon=True)
            self._thread.start()
            return {'ok': True, 'queued': len(project_ids)}

    def _run_command(self, args: list, cwd: Path):
        if self._cancel or self._stop.is_set():
            return -2
        started = time.monotonic()
        self._log('$ ' + ' '.join(str(arg) for arg in args))
        try:
            creation = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
            process = subprocess.Popen(args, cwd=str(cwd), stdout=subprocess.PIPE,
                                       stderr=subprocess.STDOUT, text=True, errors='replace',
                                       bufsize=1, shell=False, creationflags=creation)
            with self._lock:
                self._process = process
            def consume():
                if process.stdout:
                    for line in process.stdout:
                        self._log(line)

            reader = threading.Thread(target=consume, daemon=True,
                                      name='SKELL build output')
            reader.start()
            try:
                while process.poll() is None:
                    if (self._cancel or self._stop.is_set()
                            or time.monotonic() - started > TIMEOUT_SECONDS):
                        self._terminate(process)
                        return -2
                    time.sleep(0.12)
                return process.wait(timeout=5)
            finally:
                reader.join(timeout=2)
                with self._lock:
                    if self._process is process:
                        self._process = None
                if process.stdout:
                    process.stdout.close()
        except (OSError, subprocess.SubprocessError) as error:
            self._log(f'Build tool failed: {error}')
            return -1

    @staticmethod
    def _terminate(process):
        if process.poll() is not None:
            return
        if os.name == 'nt':
            # Only stop the process tree we just started, not unrelated processes.
            subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                           capture_output=True, timeout=8, check=False)
        else:
            process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)

    def _run_queue(self, with_tests):
        while True:
            with self._lock:
                if self._cancel or self._stop.is_set() or not self._queue:
                    self._queue.clear()
                    self._active = None
                    return
                pid = self._queue.pop(0)
                root = Path(self._folders[pid])
                self._active = {'project_id': pid, 'step': 'configure', 'started_at': utc_now()}
            start = time.monotonic()
            build = root / '.skell-build'
            # Never allow a pre-existing build-directory symlink to redirect writes.
            if build.is_symlink():
                self._log('Refusing symlinked .skell-build directory')
                configure = -1
            else:
                configure = self._run_command([self._cmd, '-S', str(root), '-B', str(build),
                                           '-DCMAKE_BUILD_TYPE=Release'], root)
            compiled = None
            tested = None
            if configure == 0 and not self._cancel:
                with self._lock: self._active['step'] = 'compile'
                compiled = self._run_command([self._cmd, '--build', str(build), '--config',
                                              'Release', '--parallel', '2'], root)
            if compiled == 0 and with_tests and not self._cancel:
                if (build / 'CTestTestfile.cmake').is_file():
                    with self._lock: self._active['step'] = 'ctest'
                    tested = self._run_command(['ctest', '--test-dir', str(build), '-C',
                                                'Release', '--output-on-failure'], root)
                else:
                    self._log('CTest not configured; host testing remains unverified')
            artifacts = find_vst3(build) if compiled == 0 else []
            signatures = {}
            for relative in artifacts:
                file = build / relative
                try:
                    signatures[relative] = sha256_file(file)
                except OSError:
                    self._log('Could not hash artifact: ' + relative)
            status = ('cancelled' if self._cancel or self._stop.is_set() else
                      'failed' if configure != 0 or compiled not in (None, 0) or tested not in (None, 0) else
                      'compiled')
            record = {'project_id': pid, 'status': status, 'at': utc_now(),
                      'duration_seconds': round(time.monotonic() - start, 1),
                      'configure_exit': configure, 'compile_exit': compiled,
                      'ctest_exit': tested, 'vst3_binaries': artifacts,
                      'artifact_verified': bool(artifacts) and len(signatures) == len(artifacts),
                      'sha256': signatures, 'source_folder': str(root.resolve()),
                      'log_tail': list(self._logs[-40:]),
                      'note': 'Compilation is not FL Studio or audio-quality verification'}
            with self._lock:
                self._history.insert(0, record)
                self._history = self._history[:MAX_HISTORY]
                self._active = None
                try: self._save()
                except OSError as error: self._log('Build record save failed: ' + str(error))
                if self._cancel or self._stop.is_set():
                    self._queue.clear()
                    return

    def install_artifact(self, project_id: str, destination: str, confirmed: bool):
        """Explicit user-confirmed VST3 install; preserve existing bundle for rollback."""
        if confirmed is not True:
            return {'ok': False, 'error': 'Explicit installation confirmation required'}
        with self._lock:
            if self._active or self._queue:
                return {'ok': False, 'error': 'Cannot install while builds are running'}
            if project_id not in self._folders:
                return {'ok': False, 'error': 'Choose a local project folder first'}
            source_root = Path(self._folders[project_id]) / '.skell-build'
            latest = next((h for h in self._history if h.get('project_id') == project_id), None)
            if not latest or latest.get('status') != 'compiled' or not latest.get('artifact_verified'):
                return {'ok': False, 'error': 'No verified local build artifact is available'}
            binaries = latest.get('vst3_binaries', [])
            if not isinstance(binaries, list) or not binaries:
                return {'ok': False, 'error': 'Build record has no verified binary'}
            if latest.get('source_folder') != str(source_root.parent.resolve()):
                return {'ok': False, 'error': 'Project folder changed since the build; rebuild before installing'}
            part = Path(binaries[0])
            if part.is_absolute() or '..' in part.parts:
                return {'ok': False, 'error': 'Invalid artifact path'}
            bundle_path = next((i for i,p in enumerate(part.parts)
                                if p.lower().endswith('.vst3')), None)
            if bundle_path is None:
                return {'ok': False, 'error': 'Not a VST3 artifact'}
            bundle = source_root.joinpath(*part.parts[:bundle_path+1]).resolve()
            if not bundle.exists() or not bundle.is_relative_to(source_root.resolve()):
                return {'ok': False, 'error': 'Build output is missing or outside the project'}
            if source_root.is_symlink() or any(p.is_symlink() for p in ([bundle] if bundle.is_file() else [bundle,*bundle.rglob('*')])):
                return {'ok': False, 'error': 'Refusing to install bundle with symlinks'}
            binary = source_root / part
            expected = latest.get('sha256', {}).get(binaries[0])
            if not isinstance(expected, str) or len(expected) != 64:
                return {'ok': False, 'error': 'No build-time SHA-256 evidence; rebuild before installing'}
            try:
                if (vst3_binary_kind(binary) is None or (os.name == 'nt' and vst3_binary_kind(binary) != 'PE')
                        or sha256_file(binary) != expected):
                    return {'ok': False, 'error': 'VST3 changed or is invalid since build; rebuild before installing'}
            except OSError:
                return {'ok': False, 'error': 'VST3 unavailable; rebuild before installing'}
            target_dir = Path(destination).resolve()
            if (not target_dir.is_dir() or target_dir == Path(target_dir.anchor)
                    or target_dir == Path.home() or target_dir.is_relative_to(source_root.parent)):
                return {'ok': False, 'error': 'Choose a separate existing VST3 installation folder'}
            target = target_dir / bundle.name
            if target.is_symlink():
                return {'ok': False, 'error': 'Refusing to overwrite a symlink'}
            suffix = uuid.uuid4().hex[:12]
            staged = target_dir / ('.skell-staged-' + suffix + '-' + bundle.name)
            backup = target_dir / ('.skell-backup-' + suffix + '-' + bundle.name)
            try:
                if bundle.is_dir():
                    shutil.copytree(bundle, staged, symlinks=True)
                else:
                    shutil.copy2(bundle, staged)
                if bundle.is_dir():
                    binary_in_copy = staged.joinpath(*part.parts[bundle_path+1:])
                else:
                    binary_in_copy = staged
                if (vst3_binary_kind(binary_in_copy) is None or
                        sha256_file(binary_in_copy) != expected):
                    raise OSError('Staged VST3 hash or binary format differs from the verified build')
                prior = target.exists()
                if prior:
                    os.replace(target, backup)
                try:
                    os.replace(staged, target)
                except OSError:
                    if prior:
                        os.replace(backup, target)
                    raise
                self._installs[project_id] = {
                    'target': str(target), 'backup': str(backup) if prior else None,
                    'at': utc_now(), 'status': 'installed', 'bundle': bundle.name}
                try:
                    self._save()
                except OSError as error:
                    return {'ok': True, 'installed': str(target), 'backup_saved': prior,
                            'warning': 'Install completed but rollback history could not be saved: ' + str(error)}
                return {'ok': True, 'installed': str(target), 'backup_saved': prior}
            except OSError as error:
                return {'ok': False, 'error': f'Install failed safely: {error}'}
            finally:
                if staged.exists():
                    # Staged data were created by us, not user's existing project files.
                    if staged.is_dir(): shutil.rmtree(staged)
                    else: staged.unlink(missing_ok=True)

    def rollback_install(self, project_id: str, confirmed: bool):
        if confirmed is not True:
            return {'ok': False, 'error': 'Explicit rollback confirmation required'}
        with self._lock:
            record = self._installs.get(project_id)
            if self._active or self._queue or not record or record.get('status') != 'installed':
                return {'ok': False, 'error': 'No completed install eligible for rollback'}
            backup_text = record.get('backup')
            if not backup_text:
                return {'ok': False, 'error': 'No previous installation exists to restore'}
            backup, target = Path(backup_text), Path(record['target'])
            if not backup.exists() or not target.exists() or backup.is_symlink() or target.is_symlink():
                return {'ok': False, 'error': 'Install or backup missing; refusing unsafe rollback'}
            displaced = target.with_name('.skell-replaced-' + uuid.uuid4().hex[:12] + '-' + target.name)
            try:
                os.replace(target, displaced)
                try: os.replace(backup, target)
                except OSError:
                    os.replace(displaced, target)
                    raise
                record['status'] = 'rolled-back'
                record['replaced_newer_at'] = str(displaced)
                try:
                    self._save()
                except OSError as error:
                    return {'ok': True, 'restored': str(target), 'newer_copy': str(displaced),
                            'warning': 'Rollback completed but history could not be saved: ' + str(error)}
                return {'ok': True, 'restored': str(target), 'newer_copy': str(displaced)}
            except OSError as error:
                return {'ok': False, 'error': f'Rollback unsuccessful: {error}'}

    def cancel(self):
        with self._lock:
            if not self._active and not self._queue:
                return {'ok': False, 'error': 'No active build'}
            self._cancel = True
            self._queue.clear()
            process = self._process
        if process:
            self._terminate(process)
        return {'ok': True}

    def set_schedule(self, project_id: str, interval: int, with_tests: bool, enabled: bool):
        with self._lock:
            if enabled:
                if not valid_project_id(project_id) or project_id not in self._folders:
                    return {'ok': False, 'error': 'Choose an authorized project folder first'}
                if interval not in INTERVALS:
                    return {'ok': False, 'error': 'Choose 60, 120 or 240 minutes'}
            self._schedule = {'enabled': bool(enabled), 'project_id': project_id if enabled else '',
                              'interval_minutes': interval if interval in INTERVALS else 120,
                              'with_tests': bool(with_tests),
                              'next_due': self._clock() + interval * 60 if enabled else None}
            try: self._save()
            except OSError as error: return {'ok': False, 'error': str(error)}
        return {'ok': True}

    def _schedule_loop(self):
        while not self._stop.wait(15):
            with self._lock:
                s = self._schedule
                if not s['enabled'] or not s['next_due'] or self._clock() < s['next_due']:
                    continue
                s['next_due'] = self._clock() + s['interval_minutes'] * 60
                if self._active or self._queue:
                    continue
                pid = s['project_id']
                tests = s['with_tests']
                try: self._save()
                except OSError: pass
            # Requires explicit opt-in once; remains local to the active app process.
            self.start([pid], with_tests=tests)

    def shutdown(self):
        self._stop.set()
        self.cancel()
        self._scheduler.join(timeout=2)
        with self._lock:
            t = self._thread
        if t is not None and t.is_alive():
            t.join(timeout=4)
        self._shutdown = True
