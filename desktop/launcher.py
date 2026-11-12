"""Opt-in Windows per-user URL handler for opening Project Hub from SkellWorld.

Never connect this URL protocol to the SW1 event broker or parse arguments from
an untrusted URL. No filesystem or GitHub commands are accepted via the handler.
"""
from __future__ import annotations
import sys
from pathlib import Path

SCHEME = 'skellprojecthub'
URL = SCHEME + '://open'
KEY = 'Software\\Classes\\' + SCHEME


def valid_launch_url(value: str):
    return value == URL or value == URL + '/'


def register(exe: Path, *, unregister=False):
    if sys.platform != 'win32':
        return {'ok': False, 'error': 'Windows-only integration'}
    exe = Path(exe).resolve()
    if not exe.is_file() or exe.suffix.lower() != '.exe':
        return {'ok': False, 'error': 'Current Windows executable is unavailable'}
    try:
        import winreg
        command = '"' + str(exe) + '" --from-skellworld "%1"'
        access = winreg.KEY_READ if unregister else winreg.KEY_READ | winreg.KEY_WRITE
        opener = winreg.OpenKey if unregister else winreg.CreateKeyEx
        with opener(winreg.HKEY_CURRENT_USER, KEY, 0, access) as key:
            if unregister:
                try:
                    with winreg.OpenKey(key, r'shell\open\command') as action:
                        existing, _ = winreg.QueryValueEx(action, '')
                except OSError:
                    existing = None
                if existing != command:
                    return {'ok': False, 'error': 'Protocol is not owned by this executable'}
            else:
                try:
                    with winreg.OpenKey(key, r'shell\open\command') as action:
                        existing, _ = winreg.QueryValueEx(action, '')
                except OSError:
                    existing = None
                if existing and existing != command:
                    return {'ok': False, 'error': 'Another app already owns this protocol'}
                winreg.SetValueEx(key, '', 0, winreg.REG_SZ, 'URL:SKELL Project Hub')
                winreg.SetValueEx(key, 'URL Protocol', 0, winreg.REG_SZ, '')
                with winreg.CreateKeyEx(key, r'shell\open\command') as action:
                    winreg.SetValueEx(action, '', 0, winreg.REG_SZ, command)
                return {'ok': True, 'registered': True}
        # Reverse only the exact key the current executable registered.
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, KEY + r'\shell\open\command')
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, KEY + r'\shell\open')
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, KEY + r'\shell')
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, KEY)
        return {'ok': True, 'registered': False}
    except OSError as error:
        return {'ok': False, 'error': f'Windows launcher registration failed: {error}'}


def registration_state(exe: Path):
    if sys.platform != 'win32':
        return {'supported': False, 'registered': False}
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, KEY + r'\shell\open\command') as key:
            current, _ = winreg.QueryValueEx(key, '')
        command = '"' + str(Path(exe).resolve()) + '" --from-skellworld "%1"'
        return {'supported': True, 'registered': current == command}
    except OSError:
        return {'supported': True, 'registered': False}
