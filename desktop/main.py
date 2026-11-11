"""Native Windows shell; reuses the original HTML, CSS, and JavaScript dashboard."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import sys
import traceback

try:
    from .runtime_check import probe_pythonnet
except ImportError:
    from runtime_check import probe_pythonnet

try:
    from .storage import WorkspaceStore, storage_root
    from .world import discover
except ImportError:
    from storage import WorkspaceStore, storage_root
    from world import discover

APP_VERSION = "1.4.1"
APP_ID = "uno.skellyr.projecthub"


def assets() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "web"
    return Path(__file__).resolve().parents[1]


class Bridge:
    def __init__(self, store: WorkspaceStore | None = None):
        self.store = store if store is not None else WorkspaceStore()

    def load_workspace(self) -> dict:
        return self.store.load()

    def save_workspace(self, raw: str) -> dict:
        return self.store.save_workspace(raw)

    def save_snapshots(self, raw: str) -> dict:
        return self.store.save_snapshots(raw)

    def world_status(self) -> dict:
        return discover()

    def choose_project_folder(self) -> str:
        import webview
        results = webview.windows[0].create_file_dialog(webview.FOLDER_DIALOG)
        return str(results[0]) if results else ""

    def open_project_folder(self, path: str) -> dict:
        # This method is only called by an explicit button in the local app UI.
        if not isinstance(path, str) or not path or len(path) > 4096:
            return {"ok": False, "error": "No valid folder selected"}
        folder = Path(path)
        if not folder.is_dir():
            return {"ok": False, "error": "Folder not found"}
        if sys.platform != "win32":
            return {"ok": False, "error": "Open folder is available in the Windows application"}
        try:
            os.startfile(str(folder))  # type: ignore[attr-defined]
            return {"ok": True}
        except OSError as exc:
            return {"ok": False, "error": str(exc)}


def self_test() -> int:
    paths = [assets() / name for name in ("index.html", "styles.css", "seed.js", "app.js")]
    missing = [str(p) for p in paths if not p.is_file()]
    if missing:
        print("Missing dashboard assets:", ", ".join(missing))
        return 1
    from tempfile import TemporaryDirectory
    with TemporaryDirectory() as td:
        store = WorkspaceStore(Path(td))
        sample = json.dumps({"schema": 1, "projects": [], "comparisons": [], "changes": [], "settings": {}})
        if not store.save_workspace(sample)["ok"] or store.load()["workspace"] != sample:
            print("Workspace persistence self-test failed")
            return 1
    print("PASS: dashboard assets present; workspace persistence works")
    return 0


def startup_failure(message: str, *, interactive: bool) -> None:
    """Log a failure outside the installation folder, leaving project data intact."""
    try:
        folder = storage_root()
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'startup-error.log').write_text(message[:16000], encoding='utf-8')
    except OSError:
        pass
    if interactive and sys.platform == 'win32':
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(
                None, 'Project Hub could not open.\n\n' + message[:1400]
                + '\n\nIf you trust this download, unblock the ZIP and extract again, '
                  'or run Repair-Project-Hub.cmd in the extracted folder.\n\n'
                  'Your project data has not been changed.',
                'SKELL Project Hub - Startup error', 0x10)
        except Exception:
            pass


def run_gui(*, smoke: bool = False) -> int:
    diagnosis = probe_pythonnet()
    if not diagnosis['ok']:
        startup_failure(diagnosis['message'], interactive=not smoke)
        return 1
    try:
        import webview
        bridge = Bridge()
        root = storage_root()
        root.mkdir(parents=True, exist_ok=True)
        window = webview.create_window(
            'SKELL Project Hub', str(assets() / 'index.html'), js_api=bridge,
            width=1110, height=760, min_size=(850, 590),
            background_color='#0b100e', text_select=True)
        result = {'ok': False, 'error': 'WebView2 page did not load'}

        def smoke_window():
            try:
                if not window.events.loaded.wait(20):
                    result['error'] = 'Timed out waiting for WebView2 document'
                elif window.evaluate_js('Boolean(document.querySelector("[data-nav=projects]"))'):
                    result['ok'] = True
                else:
                    result['error'] = 'Project Hub navigation is missing'
            except Exception as error:
                result['error'] = str(error)
            finally:
                try:
                    window.destroy()
                except Exception:
                    pass

        webview.start(smoke_window if smoke else None,
                      gui='edgechromium' if sys.platform == 'win32' else None,
                      private_mode=False, storage_path=str(root / 'webview'), debug=False)
        if smoke and not result['ok']:
            startup_failure(result['error'], interactive=False)
            return 1
        return 0
    except Exception:
        startup_failure(traceback.format_exc(), interactive=not smoke)
        return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="SKELL Project Hub native desktop application")
    parser.add_argument("--self-test", action="store_true", help="Check bundle assets and persistence")
    parser.add_argument("--runtime-probe", action="store_true", help="Verify the packaged Windows .NET bridge")
    parser.add_argument("--gui-smoke-test", action="store_true", help="Open and validate the real WebView2 window")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    if args.runtime_probe:
        result = probe_pythonnet()
        if not result['ok']:
            startup_failure(result['message'], interactive=False)
        return 0 if result['ok'] else 1
    if not (assets() / 'index.html').is_file():
        startup_failure('Project Hub assets are missing', interactive=not args.gui_smoke_test)
        return 1
    return run_gui(smoke=args.gui_smoke_test)


if __name__ == "__main__":
    raise SystemExit(main())
