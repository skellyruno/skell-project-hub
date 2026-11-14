# SKELLY — Project Control

A zero-dependency, responsive, local-first project hub website for Skelly apps, VST3 plugins, and FL Studio tools.

## Quick start

**Option A: simplest (Windows or Mac)** — open `skelly_project_hub.html` in a modern browser. It is a fully self-contained single file.

**Option B: editable website** — open `index.html` after extracting the ZIP. Keep `styles.css`, `seed.js`, and `app.js` in the same folder. If your browser restricts storage for local files, host the files on a local server or GitHub Pages.

**Option C: local web server (optional)** — in this folder run `python -m http.server 8000` and open `http://localhost:8000` in the browser.

## What changed in v1.2

- **Automation Center** in Data & settings: automatic GitHub Actions/commit monitoring, configurable scope (top 8 high-priority or all linked repos), intervals (30/60/120/240 minutes; minimum 60 for all), and a manual **Check now** button. Auto-checks are on by default for priority projects at a **60-minute** interval while the tab is open and visible. The first check starts shortly after launch.
- **GitHub rate-limit protection:** two projects checked in parallel, automatic refreshes skip the releases endpoint, and a detected rate limit pauses future checks for 90 minutes. GitHub calls require network access and public repositories. If you edit the site for a public deployment, note that visitors will perform checks from their own browsers.
- **Change detection:** no duplicate build-history entries for the same run and no repeated changelog entries when public metadata is unchanged. New failures and stale head-commit results trigger in-app notices.
- **Recovery snapshots:** keep up to four local recovery copies, automatically sampled at most every 30 minutes on saved changes. Create or restore manually in Data & settings; a snapshot is also attempted before imports or resets. These are browser-local, not external backups.
- **UI and reliability:** faster priority refresh, quick project jump (**Ctrl+K**), sorted projects, expandable workboard, build history, keyboard-friendly checklists, import validation and safer handling of partial GitHub endpoint failures. Manual roadmap notes are not overwritten by GitHub refresh.
- **Conservative release criteria:** a manually reported build is identified as manual and cannot count as a GitHub CI pass for release signoff. DAW/FL Studio tests always require explicit human evidence.

**Automation scope:** The included browser dashboard does **not** start local builds, inspect VST3 binary contents, control FL Studio, or continue running after the browser tab is closed. For unattended building/testing, connect a separate Windows builder or GitHub Actions workflow with appropriate permissions.

## What's included

- **Overview:** counts, GitHub build evidence, high-priority milestones, and flagged stale/failed runs.
- **All projects:** 20 seeded workstreams, searchable/filterable, with editable status, latest task, risks, milestone, source links, and release links.
- **Project workspace:** CI/build result, separate real-world host validation, five editable checklists, manual result/evidence fields, progress, and project-local history.
- **Workboard:** outstanding checklist tasks grouped under UI, DSP/Engine, Packaging, Regression tests, and Release readiness.
- **Compare engines:** competing approaches, strengths, unknowns, evidence, status, and local reference file metadata.
- **Change log:** seeded GitHub snapshot entries and automatically recorded edits, plus manually entered notes with evidence URLs.
- **Data & settings:** export/import the complete workspace as JSON. All normal edits save in this browser's localStorage.

## Accuracy and source limitations

The seed data was assembled from GitHub repository listings, latest commits and recent Actions results inspected on **November 7, 2026**. An Actions `success` with a matching inspected head SHA is recorded as a CI pass **only**, never as verified FL Studio stability or production readiness. An Actions success for an older SHA is **stale**. Uninspected repositories, missing builds, actual release downloads, audio-quality benchmarks, and untested engine changes are explicitly labeled unknown or untested.

The `LYRICFORGE` repository is displayed using the app name **SkellyMotion**. The `skell-chess-vst` repository is displayed as **Checkmate**. The **FLP Modifier** and **Skell AdlibLab** repositories were not confirmed in the connected repo list. The **FL Project Cleaner** repository was empty when checked. Seeded reference implementation comparisons contain notes only; no reference ZIP contents were analyzed or stored inside this site.

**Refresh GitHub** on a project makes browser requests to GitHub's public API for that project's latest commit, newest workflow run, and latest release. This can fail for private repositories, unavailable networks, or GitHub API rate limits. No token is requested or stored. It refreshes GitHub metadata only and does not alter host-test results or checklist signoff.

Release readiness is conservatively computed only when **all recorded checklist items are complete**, the GitHub-observed build status passes, and the **real-world validation state is Passed**. Be aware that a manually reported passing build is tagged **Manual pass**, not CI-verified.

## Reference files and persistence

The comparison form can select a ZIP, source file, WAV, or other reference. It stores the **filename and size only**, not the contents or a diff. Keep original files elsewhere and write benchmark notes in the comparison.

Browser localStorage is **not shared across devices/browsers** and can be cleared. Use **Data & settings → Export JSON backup** after meaningful edits. Import replaces the existing workspace after confirmation. No database, login, cloud sync, GitHub mutation, or server is included. Automated GitHub checks run only in the browser while the dashboard is open; they do not upload workspace data to GitHub.

## Publish on GitHub Pages

1. Create a new repository for the dashboard (e.g. `skelly-project-control`).
2. Upload `index.html`, `styles.css`, `seed.js`, `app.js` to its root.
3. In the repository's Settings → Pages, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. Use the resulting Pages URL or configure your own domain DNS separately.

This is suitable for a **personal** dashboard. Deploying it publicly does **not** make its local browser edits collaborative: for secure multi-user editing, add authentication and server-side persistence first.

## Project files

- `index.html`: website entry.
- `styles.css`: responsive dark/neon styling.
- `seed.js`: transparent starter records and reusable checklists.
- `app.js`: editing, filtering, comparison, history, GitHub refresh, export/import.
- `skelly_project_hub.html`: independent single-file version, including the v1.2 automation features.
- `build_standalone.py`: regenerate the self-contained HTML after editing the source files (`python build_standalone.py`).
- `tests/smoke_test.py`: optional Playwright smoke tests for the UI, simulated GitHub updates, recovery and mobile layout (`python -m pip install playwright`, then `python tests/smoke_test.py`).
- `screenshot_overview.png`, `screenshot_compare.png`, `screenshot_mobile.png`: sample UI captures (not required by the website).

## Validation performed

- JavaScript syntax checks on `seed.js` and `app.js`.
- Headless Chromium rendering checks for dashboard, all projects, project details, comparisons, changelog, settings, automation controls, and mobile layout.
- Local-storage write, manual checklist completion, project creation, project editing, test result and build result forms, comparison creation, JSON download.
- Responsive mobile viewport overflow check.
- Simulated GitHub status changes (success → failure), rate-friendly polling, no manual-task overwrite, build-history de-duplication, and snapshot restoration.

GitHub refresh was tested using simulated API responses, not a live GitHub connection; it is subject to the end user's network and repository visibility. Actual plugin or packaged app build/runtime tests are **not** performed by this website.

---

## Windows desktop milestone (v1.3)

This repository retains the v1.2 local-first dashboard. The new **Windows desktop entry point** (`desktop/main.py`) hosts the original `index.html` inside a compact WebView2 native window using pywebview. No Electron, Node runtime, localhost HTTP server, cloud account, or SW1 command bus is required to run it.

### Download and build

- Open **Actions → Windows Project Hub** after a successful `main` or `dev/*` run; download **Skell-Project-Hub-Windows-Portable**. Extract the ZIP, open the enclosed `Skell Project Hub` folder, and double-click **Skell Project Hub.exe**. The **entire folder** is required; the EXE alone is not a complete distribution.
- To build it locally on Windows with Python 3.12: `python -m pip install -r requirements-build.txt`, then `python -m PyInstaller --clean --noconfirm skell_project_hub.spec`.
- To run without packaging: `python desktop/main.py` (requires Windows WebView2 Runtime; commonly already available on Windows 11). To validate packaging without a GUI: `Skell Project Hub.exe --self-test`.
- The original `index.html` and generated `skelly_project_hub.html` continue working in a regular browser without native dependencies.

### Data safety and migration

Native workspace data lives in `%APPDATA%\SKELL\ProjectHub\workspace.json`, plus `workspace.previous.json` and `snapshots.json`. It is **never inside the EXE folder**, so replacing/updating the portable distribution does not overwrite edits. Saves use an atomic temporary-file replacement. An earlier valid workspace can be recovered after corruption. Existing browser-only edits are not silently copied across application storage profiles: use **Data & settings → Export JSON backup**, then **Import JSON backup** in the desktop app. Data is not synced to GitHub or SkellWorld.

### SkellWorld Developer Mode integration

The **SkellWorld** navigation view discovers the real read-only SkellWorld console on `127.0.0.1:48674` via `/api/status` and `/api/catalog`, on demand and once at desktop startup. It displays only unprivileged informational presence and catalog integration states, never claims planned catalog entries are live, and gracefully reports SkellWorld offline. Source: [SkellWorld repository](https://github.com/skellyruno/SkellWorld). The **SW1 broker on port 48673 is not used** for commands, filesystem operations, GitHub writes, or automation. The `desktop/skellworld-app.json` declaration provides app identity and packaging metadata for a future SkellWorld launcher; the current SkellWorld repository **does not yet implement discovery or launching from this manifest**. Full cross-application launch integration requires a separate reviewed change in SkellWorld; it is not presented here as finished.

Native project-folder selection is user-initiated and only opens a selected directory in Explorer; no files are modified or deleted. GitHub Actions monitoring still uses public browser API calls and does not perform authenticated GitHub actions or local compilation. Windows CI packages the EXE and exercises headless browser tests, native store tests, and an EXE CLI smoke test. **FL Studio host testing and visual verification of the packaged WebView2 window remain manual**.

### Running tests

```sh
python -m unittest discover -s tests -p 'test_*.py' -v
python tests/test_desktop_ui.py
python tests/smoke_test.py
node --check app.js
node --check desktop_bridge.js
python -m desktop.main --self-test
```

A successful CI build proves a distributable was produced and passed the automated tests; it is not evidence of a verified VST3 or DAW host test.

## v1.4 — Safer updates and evidence (November 11, 2026)

The **desktop AppData workspace** now keeps the immediately preceding valid revision on every successful distinct write. If a disk write fails, the current browser copy is retained and a bounded retry is scheduled; the native storage indicator and **Data & settings → Workspace save health** display the pending/saved state. Always export important work periodically to an external backup, especially if the drive is nearly full.

**Release readiness** requires a matching current GitHub commit SHA and successful GitHub run as well as manual host/DAW validation. A successful run for another commit, or an unavailable HEAD check, is not counted as a CI pass. This is a conservative readiness indicator, **not** a guarantee that the app has passed DAW tests. GitHub monitoring remains active only while the desktop app/window is open.

No privileged SkellWorld API, DAW control, or automatic file changes have been added. The existing localhost dashboard remains read-only.


## v2.0 — Developer Command Center

The Developer Center lives in the existing Project Hub desktop application, preserving
workspace data, checklists, notes, browser-only dashboard, and opt-in SkellWorld
aggregate sharing. Its local Windows Builder runs CMake Release builds inside
an explicitly linked CMake project folder, with a single cancelable build queue,
bounded output, elapsed times, and optional CTest.

A CI pass, compile pass, VST3 binary verification, install, and FL Studio host
validation are distinct states. Actual VST3 evidence requires a nonempty compiled
binary. Build All operates only on user-linked local projects. Build scripts can
execute arbitrary code; only link and build directories you trust.

The installer requires an explicit confirmation and a user-selected directory,
preserves the previous plugin in a rollback backup, and never silently installs.
Scheduling (60/120/240 minutes) is off by default, runs only while Project Hub
is open, and cannot install, publish, or access SW1. The UI polls build status
only while Developer Center is visible.

Project Hub can optionally register the Windows per-user URI
`skellprojecthub://open` using an explicit in-app click. SkellWorld's separate
Developer Mode uses a normal OS link and confirmation; this does not give
SkellWorld privileged access or modify its SW1 plugin-event protocol.
Project Hub continues to work when SkellWorld is closed.

Source and browser tests: `python -m unittest discover -s tests -p 'test_*.py'`,
`python tests/smoke_test.py`, `python tests/test_desktop_ui.py`,
`python tests/test_developer_ui.py`, `node --check dev_center.js`.
Windows CI additionally builds and loads the actual native EXE.

### v2.1 integrity and CPU improvements

Build evidence now records the exact linked project root and SHA-256 of each plausible native VST3 binary. On Windows, the installer requires a PE-format binary and checks the SHA-256 before **and after** staging the copy. A previous v2.0 build record without this provenance cannot install; rebuild the linked project with v2.1 first. This is not cryptographic signing, plugin scanning, or proof that FL Studio accepts the plugin. Scheduled builds remain opt-in, and no installation happens automatically. The Developer Center polls every 12 seconds while idle, 2.5 seconds during a build, and not at all when hidden. The Windows CI now checks the exact, non-privileged SkellWorld URI startup path.

### v2.2: Local resource diagnostics and real JUCE builder integration

Under **Developer Center → Windows resource diagnostics**, select **Measure 5 seconds** to sample the Project Hub process and accessible WebView2 descendants. Values show CPU normalized over all logical cores, observed working-set memory, and approximate peak sampled working set. These figures may exclude detached/protected renderer processes and do not measure FL Studio or a full-day CPU baseline. No permanent performance poller is enabled.

A separate GitHub Actions workflow, **Project Hub Real JUCE Integration**, checks out immutable SkellCore Quickstart source (pinned SHA), compiles a real JUCE 8.0.12 VST3 through the Project Hub builder, checks its Windows PE header and SHA-256, and verifies installation into a throwaway directory. This does not install any plugin into the runner's DAW folders or claim host validation.
