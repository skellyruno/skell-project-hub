# SKELL Project Hub v2.3 — FL Studio host acceptance

This is a test checklist, not evidence the work has already passed. CMake success and VST3 binary hashes do not guarantee FL Studio compatibility.

## Preparation
- [ ] Extract verified Project Hub and keep its _internal folder beside the EXE.
- [ ] Keep an untouched backup of the existing Skell Spacer VST3 and test FLP.
- [ ] Close FL Studio before any VST3 install or rollback.
- [ ] Link the trusted local Skell Spacer CMake source in Developer Center.
- [ ] Record host version, plugin Git SHA, CPU/OS, sample rate, and buffer size.

## Project Hub build
- [ ] Build Release; verify configure/build exit codes, duration, source path and SHA-256.
- [ ] Verify the actual x64 PE32+ VST3 binary, rather than just a named directory.
- [ ] Install into a dedicated, temporary test plugin directory after explicit confirmation.
- [ ] Confirm previous plugin files were backed up and staged files matched the recorded hash.

## Real FL Studio verification
- [ ] Rescan the test VST3 folder in FL Studio Plugin Manager.
- [ ] Load the plugin into a fresh FLP and a copy of an existing project.
- [ ] Repeatedly open/close its real editor; inspect layout, menus, focus, and resizing.
- [ ] Test 44.1, 48 and 96 kHz with multiple host buffer sizes.
- [ ] Listen to level-matched input/output; check silence, artifacts, latency and dropouts.
- [ ] Test two instances, automation, presets, save/reopen and old-project compatibility.
- [ ] Measure real CPU/memory use on the target Ryzen Windows workstation.
- [ ] Close FL Studio, request rollback in Project Hub, and confirm the old VST3 is restored while the newer one is preserved.
- [ ] Reopen the FLP and recheck audio/state after rollback.

Definitions: Compiled means build-tool success; VST3 verified means matching architecture and hash; installed/rolled back means temporary filesystem operations passed; FL Studio verified requires host evidence. Only the last is sufficient for audio-host release claims.

No scheduled build may install or publish. SkellWorld SW1 remains informational only.
