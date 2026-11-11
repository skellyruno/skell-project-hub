# SKELLY Project Hub — Release history

## v1.2 · November 9, 2026

- Added Automation Center with configurable public-GitHub checks, interval controls and priority/all scope.
- Added failure/stale CI alerts, GitHub API backoff, limited concurrency and low-overhead polling when page is visible.
- Added rotating local recovery snapshots, restore controls and pre-reset/pre-import protection.
- Preserved manual project plans during GitHub sync; reduced duplicate logs and build-history observations.
- Improved UI navigation (Ctrl+K), sorting, checklist UX and manual-vs-CI evidence handling.
- Added single-file regeneration and automated browser tests with mocked GitHub API responses.

**Known limitations:** Local-first static website, not a Windows EXE. No host-based FL Studio testing or local CI runner. Automatic monitoring stops when the site is closed.

## v1.3 — Desktop + SkellWorld integration foundation (2026-11-10)

- Preserve the existing v1.2 dashboard, checklists, workflow history, GitHub automation and self-contained HTML.
- Native Windows WebView2 shell using pywebview with compact 1110×760 default and persistent profile, no console window in packaged build.
- Atomic disk saves and recovery for projects and local snapshots in AppData; browser import/export remains supported.
- Explicit native project folder association and Explorer opening; no destructive filesystem operations.
- Safe read-only SkellWorld status and catalog discovery; offline fallback, accurate planned-vs-connected states, and developer integration manifest. SW1 remains unchanged.
- GitHub Actions Windows portable ZIP build, native storage/security tests, and headless UI integration smoke tests.
- Pending: Windows EXE artifact verification by real Actions run, Windows GUI smoke/visual tests, SkellWorld launcher counterpart.

## v1.4 — Native data safety and verified CI evidence (2026-11-11)

- Native disk save failures now retain the newest pending workspace and retry with bounded exponential backoff; the UI shows saving, saved, and retry states.
- Automatic recovery repairs a damaged primary disk workspace after loading its valid previous revision.
- Each distinct successful disk save preserves the immediately previous valid version, rather than a potentially 30-minute-old recovery snapshot.
- Release readiness now requires a GitHub-observed successful run matching the inspected current commit and a real-world validation pass; historical/manual/unknown evidence cannot silently qualify.
- Github refresh ignores in-flight results for a project replaced by an import or reset, and cannot mark a workflow pass when HEAD lookup fails or the run SHA differs.
- Added regression tests for rotating recovery files, transient native save errors, and mismatched or unavailable GitHub HEAD evidence.

**Remaining:** Live Windows WebView2 visual and CPU profiling, SkellWorld launcher counterpart, and non-browser background builder remain separate milestones. Read-only SkellWorld connectivity is unchanged.
