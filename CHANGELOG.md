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
