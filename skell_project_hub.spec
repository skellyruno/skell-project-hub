# PyInstaller spec: build with python -m PyInstaller skell_project_hub.spec
from pathlib import Path
from PyInstaller.utils.hooks import collect_all

root = Path(SPECPATH)
webview_data, webview_binaries, webview_hidden = collect_all('webview')
assets = [(str(root / f), 'web') for f in ('index.html','app.js','seed.js','styles.css','desktop_bridge.js')]
a = Analysis(['desktop/main.py'], pathex=[str(root), str(root / 'desktop')],
    binaries=webview_binaries, datas=webview_data + assets + [(str(root/'desktop'/'skellworld-app.json'), '.')],
    hiddenimports=webview_hidden, excludes=['tkinter', 'PyQt5', 'PyQt6', 'PySide2', 'PySide6'],
    noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='Skell Project Hub',
    debug=False, bootloader_ignore_signals=False, strip=False, upx=False,
    console=False, disable_windowed_traceback=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='Skell Project Hub')
