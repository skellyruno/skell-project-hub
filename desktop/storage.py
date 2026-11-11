"""Durable Project Hub workspace data, separate from the executable/install folder."""
from __future__ import annotations
import json
import os
from pathlib import Path
import tempfile
import threading

MAX_WORKSPACE = 5 * 1024 * 1024
MAX_SNAPSHOTS = 4 * 1024 * 1024


def storage_root() -> Path:
    base = os.environ.get("APPDATA") or os.environ.get("XDG_DATA_HOME")
    return Path(base) / "SKELL" / "ProjectHub" if base else Path.home() / ".skell" / "ProjectHub"


def valid_workspace(value) -> bool:
    if not isinstance(value, dict) or value.get("schema") != 1:
        return False
    if not isinstance(value.get("projects"), list) or len(value["projects"]) > 500:
        return False
    if not isinstance(value.get("comparisons"), list) or not isinstance(value.get("changes"), list):
        return False
    if not isinstance(value.get("settings"), dict):
        return False
    for p in value["projects"]:
        if not isinstance(p, dict) or not isinstance(p.get("id"), str) or not isinstance(p.get("checklists"), dict):
            return False
    return True


def valid_snapshots(value) -> bool:
    return isinstance(value, list) and len(value) <= 4 and all(
        isinstance(item, dict) and isinstance(item.get("at"), str)
        and isinstance(item.get("data"), str)
        for item in value
    )


class WorkspaceStore:
    def __init__(self, root: Path | None = None):
        self.root = Path(root) if root is not None else storage_root()
        self._lock = threading.RLock()

    def _read(self, name: str, limit: int) -> str | None:
        path = self.root / name
        try:
            if path.stat().st_size > limit:
                return None
            return path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            return None

    def load(self) -> dict:
        with self._lock:
            raw = self._read("workspace.json", MAX_WORKSPACE)
            recovered = False
            try:
                if raw is None or not valid_workspace(json.loads(raw)):
                    raise ValueError("Invalid workspace")
            except (ValueError, TypeError):
                raw = self._read("workspace.previous.json", MAX_WORKSPACE)
                try:
                    if raw is None or not valid_workspace(json.loads(raw)):
                        raw = None
                    else:
                        recovered = True
                except (ValueError, TypeError):
                    raw = None
            snapshots = self._read("snapshots.json", MAX_SNAPSHOTS)
            try:
                if snapshots is None or not valid_snapshots(json.loads(snapshots)):
                    snapshots = None
            except (ValueError, TypeError):
                snapshots = None
            return {"workspace": raw, "snapshots": snapshots, "recovered": recovered}

    def _atomic(self, name: str, raw: str) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        path = self.root / name
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=self.root, prefix=".skell-", suffix=".tmp", delete=False) as f:
                temporary = Path(f.name)
                f.write(raw)
                f.flush()
                os.fsync(f.fileno())
            os.replace(temporary, path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    def save_workspace(self, raw: str) -> dict:
        if not isinstance(raw, str) or len(raw.encode("utf-8")) > MAX_WORKSPACE:
            return {"ok": False, "error": "Workspace data exceeds the 5 MB limit"}
        try:
            obj = json.loads(raw)
            if not valid_workspace(obj):
                return {"ok": False, "error": "Invalid workspace structure"}
            with self._lock:
                previous = self._read("workspace.json", MAX_WORKSPACE)
                if previous == raw:
                    return {"ok": True}
                # Always preserve the *immediately* preceding valid revision.
                # A timed backup could lose up to 30 minutes of edits on corruption.
                # Never replace an older valid recovery copy with malformed bytes.
                if previous:
                    try:
                        if valid_workspace(json.loads(previous)):
                            self._atomic("workspace.previous.json", previous)
                    except (ValueError, TypeError):
                        pass
                self._atomic("workspace.json", raw)
            return {"ok": True}
        except (OSError, ValueError, TypeError) as exc:
            return {"ok": False, "error": str(exc)}

    def save_snapshots(self, raw: str) -> dict:
        if not isinstance(raw, str) or len(raw.encode("utf-8")) > MAX_SNAPSHOTS:
            return {"ok": False, "error": "Snapshots exceed the 4 MB limit"}
        try:
            if not valid_snapshots(json.loads(raw)):
                return {"ok": False, "error": "Invalid snapshot data"}
            with self._lock:
                self._atomic("snapshots.json", raw)
            return {"ok": True}
        except (ValueError, OSError) as exc:
            return {"ok": False, "error": str(exc)}
