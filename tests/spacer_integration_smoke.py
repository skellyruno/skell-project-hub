"""Real Skell Spacer VST3 build, integrity, install and rollback proof.

Runs in a disposable CI checkout and temp installation folder. Compiling a VST3
does NOT prove that it loads in FL Studio or that its DSP is audio-verified.
"""
from __future__ import annotations
import os
import shutil
import tempfile
import time
from pathlib import Path

from desktop.builder import BuildManager, sha256_file, vst3_binary_kind


def run():
    source_text = os.environ.get("SKELL_SPACER_SOURCE")
    if not source_text:
        raise RuntimeError("SKELL_SPACER_SOURCE must point to pinned checkout")
    source = Path(source_text).resolve(strict=True)
    if not (source / "CMakeLists.txt").is_file() or not (source / "Source" / "SpacerDSP.h").is_file():
        raise RuntimeError("Source is not the expected Skell Spacer repository")
    with tempfile.TemporaryDirectory() as state_dir, tempfile.TemporaryDirectory() as target_dir:
        manager = BuildManager(Path(state_dir))
        try:
            linked = manager.link_folder("skell-spacer-real", str(source))
            assert linked["ok"], linked
            started = manager.start(["skell-spacer-real"], with_tests=False)
            assert started["ok"], started
            deadline = time.monotonic() + 1800
            while time.monotonic() < deadline:
                state = manager.status()
                if state["history"] and not state["active"] and not state["queue"]:
                    break
                time.sleep(1)
            else:
                manager.cancel()
                raise AssertionError("Skell Spacer native VST3 compilation exceeded 30 minutes")
            entry = state["history"][0]
            assert entry["status"] == "compiled", "\n".join(state["logs"])
            assert entry["artifact_verified"], entry
            assert entry["vst3_binaries"], "No actual VST3 binary found"
            for relative in entry["vst3_binaries"]:
                binary = source / ".skell-build" / relative
                assert vst3_binary_kind(binary) == "PE", relative
                assert sha256_file(binary) == entry["sha256"][relative]
            path = Path(entry["vst3_binaries"][0])
            components = path.parts
            bundle_idx = next((i for i, p in enumerate(components) if p.lower().endswith(".vst3")), None)
            assert bundle_idx is not None, components
            bundle = source / ".skell-build" / Path(*components[:bundle_idx+1])
            destination = Path(target_dir)
            old_copy = destination / bundle.name
            # Prepopulate a previous TEMPORARY installation; do not touch Program Files.
            if bundle.is_dir():
                shutil.copytree(bundle, old_copy)
                old_binary = old_copy.joinpath(*components[bundle_idx+1:])
            else:
                shutil.copy2(bundle, old_copy)
                old_binary = old_copy
            old_binary.write_bytes(old_binary.read_bytes() + b"\nSKELL-OLD-VERSION-ROLLBACK-PROBE\n")
            old_digest = sha256_file(old_binary)
            installed = manager.install_artifact("skell-spacer-real", str(destination), confirmed=True)
            assert installed["ok"] and installed["backup_saved"], installed
            new_binary = destination / bundle.name
            if new_binary.is_dir():
                new_binary = new_binary.joinpath(*components[bundle_idx+1:])
            assert sha256_file(new_binary) == entry["sha256"][str(path)], "New install hash mismatch"
            rollback = manager.rollback_install("skell-spacer-real", confirmed=True)
            assert rollback["ok"], rollback
            restored_binary = destination / bundle.name
            if restored_binary.is_dir():
                restored_binary = restored_binary.joinpath(*components[bundle_idx+1:])
            assert sha256_file(restored_binary) == old_digest, "Old version not restored"
            assert Path(rollback["newer_copy"]).exists(), "Newer copy was not preserved"
            print("PASS: pinned Skell Spacer JUCE VST3 compiled, verified, installed, and rolled back in temporary folder")
            print("FL STUDIO HOST TEST: NOT PERFORMED")
        finally:
            manager.shutdown()


if __name__ == "__main__":
    run()
