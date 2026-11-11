"""Check the packaged Windows pythonnet bridge before starting WebView2.

Do not remove download security markings without the user's approval.
"""
from __future__ import annotations
from pathlib import Path
import re
import sys

DLL_RELATIVE_PATH = Path('pythonnet') / 'runtime' / 'Python.Runtime.dll'


def download_zone(path: Path, *, platform: str | None = None) -> int | None:
    if (platform or sys.platform) != 'win32':
        return None
    try:
        value = Path(str(path) + ':Zone.Identifier').read_text(
            encoding='utf-8-sig', errors='replace')
    except OSError:
        return None
    match = re.search(r'^ZoneId\s*=\s*(\d+)\s*$', value,
                      flags=re.MULTILINE | re.IGNORECASE)
    return int(match.group(1)) if match else None


def bundled_runtime_check(bundle: Path, *, platform: str | None = None) -> dict:
    dll = Path(bundle) / DLL_RELATIVE_PATH
    if not dll.is_file():
        return {'ok': False, 'reason': 'missing',
                'message': 'The packaged Python.Runtime.dll is missing. Extract the complete ZIP.'}
    zone = download_zone(dll, platform=platform)
    if zone in (3, 4):
        return {'ok': False, 'reason': 'blocked',
                'message': ('Windows marked Python.Runtime.dll as an internet download. '
                            'If you trust this release, unblock the original ZIP before extraction '
                            'or run Repair-Project-Hub.cmd in the app folder.')}
    return {'ok': True, 'reason': 'present'}


def probe_pythonnet(*, bundle: Path | None = None, frozen: bool | None = None,
                    platform: str | None = None) -> dict:
    system = platform or sys.platform
    if system != 'win32':
        return {'ok': True, 'reason': 'not-windows'}
    if frozen is None:
        frozen = bool(getattr(sys, 'frozen', False))
    if frozen:
        root = bundle if bundle is not None else Path(sys._MEIPASS)
        checked = bundled_runtime_check(root, platform=system)
        if not checked['ok']:
            return checked
    try:
        import clr  # noqa: F401 - intentionally load .NET before the GUI
    except Exception as error:
        return {'ok': False, 'reason': 'load-failed',
                'message': ('The Windows .NET bridge failed: '
                            + f'{type(error).__name__}: {error}. '
                            + 'If you trust this release, run Repair-Project-Hub.cmd; '
                            + 'if it persists, inspect AppData startup-error.log.')}
    return {'ok': True, 'reason': 'loaded'}
