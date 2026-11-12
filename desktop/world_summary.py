"""Explicitly opted-in local SkellWorld aggregate status sharing.

No project names, folders, notes, repo URLs, checklists or credentials are
written. File is not a command channel. All output is bounded and atomic.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
import time

try:
    from .storage import WorkspaceStore, valid_workspace
except ImportError:
    from storage import WorkspaceStore, valid_workspace

SCHEMA = "skellworld-projecthub-summary/1"
SOURCE = "uno.skellyr.projecthub"
MAX_PUBLISH_BYTES = 4096

def shared_directory() -> Path:
    """Same user-owned data directory resolved by SkellWorld's bridge reader."""
    base = os.environ.get("APPDATA") or os.environ.get("XDG_DATA_HOME")
    root = Path(base) if base else Path.home() / ".skell"
    return root / "SKELL" / "WorldBridge"

class WorldSummaryBridge:
    def __init__(self, store: WorkspaceStore, shared_dir: Path | None = None):
        self.store = store
        self.shared_dir = Path(shared_dir) if shared_dir is not None else shared_directory()
        self.flag_path = self.store.root / "world-summary.optin"
        self.summary_path = self.shared_dir / "projecthub-summary-v1.json"

    def enabled(self) -> bool:
        try:
            return self.flag_path.read_text(encoding="ascii") == "1"
        except OSError:
            return False

    def status(self) -> dict:
        # This is only returned through the Project Hub's own native WebView2 bridge.
        return {"enabled": self.enabled(), "published": self.summary_path.is_file() and self.enabled(),
                "shared_fields": "aggregate counts only"}

    @staticmethod
    def aggregate(raw: str | None) -> dict | None:
        if raw is None:
            return None
        try:
            source = json.loads(raw)
        except (ValueError, TypeError):
            return None
        if not valid_workspace(source):
            return None
        projects = source["projects"]
        counts = {"projects": len(projects), "ci_passed": 0, "ci_failed": 0,
                  "ci_stale": 0, "ci_unknown": 0, "blocked": 0}
        for project in projects:
            ci = project.get("ci") if isinstance(project.get("ci"), dict) else {}
            status = str(ci.get("status", "unknown")).lower()
            key = "ci_" + (status if status in {"passed", "failed", "stale"} else "unknown")
            counts[key] += 1
            if str(project.get("stage", "")).lower() == "blocked":
                counts["blocked"] += 1
        return {"schema": SCHEMA, "source": SOURCE, "generated_at": int(time.time()),
                "counts": counts}

    def publish(self) -> dict:
        if not self.enabled():
            return {"ok": False, "error": "sharing disabled"}
        summary = self.aggregate(self.store.load().get("workspace"))
        if summary is None:
            return {"ok": False, "error": "no valid saved workspace"}
        content = (json.dumps(summary, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
        if len(content) > MAX_PUBLISH_BYTES:
            return {"ok": False, "error": "summary too large"}
        temporary = None
        try:
            self.shared_dir.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=self.shared_dir, prefix=".skell-status-",
                                            suffix=".tmp", delete=False) as stream:
                temporary = Path(stream.name)
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.summary_path)
            return {"ok": True, "published": True}
        except OSError:
            return {"ok": False, "error": "could not write world summary"}
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    def set_enabled(self, enabled: bool) -> dict:
        if not isinstance(enabled, bool):
            return {"ok": False, "error": "explicit boolean required"}
        if not enabled:
            # Revocation deletes the exported aggregate but leaves user data.
            try:
                self.flag_path.unlink(missing_ok=True)
                self.summary_path.unlink(missing_ok=True)
            except OSError:
                return {"ok": False, "error": "could not remove shared summary"}
            return {"ok": True, "enabled": False, "published": False}
        try:
            self.store.root.mkdir(parents=True, exist_ok=True)
            self.flag_path.write_text("1", encoding="ascii")
        except OSError:
            return {"ok": False, "error": "could not save sharing consent"}
        result = self.publish()
        return {"ok": True, "enabled": True, "published": bool(result.get("ok")),
                "note": "summary published" if result.get("ok") else "summary will publish after first valid workspace save"}
