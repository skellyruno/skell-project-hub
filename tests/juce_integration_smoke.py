"""Compile genuine JUCE VST3 using Project Hub's BuildManager, no host claims."""
from __future__ import annotations
import os
from pathlib import Path
import tempfile
import time
from desktop.builder import BuildManager,sha256_file,vst3_binary_kind

def run():
    location=os.environ.get("SKELL_JUCE_TEMPLATE_DIR")
    if not location:
        raise RuntimeError("SKELL_JUCE_TEMPLATE_DIR is required")
    project=Path(location).resolve(strict=True)
    if not (project/"CMakeLists.txt").is_file() or not (project/"Source"/"PluginProcessor.cpp").is_file():
        raise RuntimeError("Not the pinned SkellCore JUCE template")
    with tempfile.TemporaryDirectory() as saved, tempfile.TemporaryDirectory() as install_dir:
        manager=BuildManager(Path(saved))
        try:
            linked=manager.link_folder("actual-juce-quickstart",str(project))
            assert linked["ok"],linked
            started=manager.start(["actual-juce-quickstart"],with_tests=False)
            assert started["ok"],started
            deadline=time.monotonic()+1800
            while time.monotonic()<deadline:
                result=manager.status()
                if not result["active"] and not result["queue"] and result["history"]:
                    break
                time.sleep(1)
            else:
                manager.cancel()
                raise AssertionError("Real JUCE build timed out")
            record=result["history"][0]
            assert record["status"]=="compiled", "\n".join(result["logs"])
            assert record["artifact_verified"],record
            assert record["vst3_binaries"],record
            for path in record["vst3_binaries"]:
                file=project/".skell-build"/path
                assert vst3_binary_kind(file)=="PE",path
                assert sha256_file(file)==record["sha256"][path]
            installed=manager.install_artifact("actual-juce-quickstart",install_dir,confirmed=True)
            assert installed["ok"],installed
            assert Path(installed["installed"]).exists()
            print("PASS: genuine JUCE VST3 built, hashed and installed to temporary test folder")
            print("NOTE: FL Studio host test not performed")
        finally:
            manager.shutdown()

if __name__=="__main__":
    run()
