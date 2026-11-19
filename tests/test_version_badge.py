"""Keep the visible Project Hub version badge aligned with the packaged app."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class VersionBadgeTests(unittest.TestCase):
    def test_sidebar_badge_matches_native_app_version(self):
        native_source = (ROOT / "desktop" / "main.py").read_text(encoding="utf-8")
        version_match = re.search(
            r'^APP_VERSION\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"',
            native_source,
            re.MULTILINE,
        )
        self.assertIsNotNone(version_match, "Canonical APP_VERSION is missing")
        app_version = version_match.group(1)

        html = (ROOT / "index.html").read_text(encoding="utf-8")
        badge_versions = re.findall(r'<span id="appVersion">v([^<]+)</span>', html)
        self.assertEqual(len(badge_versions), 1, "Expected exactly one sidebar version badge")
        visible_version = badge_versions[0].split(" / ", 1)[0]
        self.assertEqual(visible_version, app_version)


if __name__ == "__main__":
    unittest.main()
