"""Regression tests for the Project Hub's seeded GitHub snapshot age label."""
from __future__ import annotations

import json
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(shutil.which("node"), "Node.js is required for the snapshot freshness test")
class SnapshotFreshnessTests(unittest.TestCase):
    def test_footer_discloses_seed_age_and_handles_invalid_dates(self):
        index = (ROOT / "index.html").read_text(encoding="utf-8")
        builder = (ROOT / "build_standalone.py").read_text(encoding="utf-8")
        self.assertIn('<script src="snapshot_freshness.js"></script>', index)
        self.assertIn("'snapshot_freshness.js'", builder)

        node_test = r"""
const fs = require('node:fs');
const vm = require('node:vm');

class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : ['2026-11-17T12:00:00.000Z']));
  }
}

const footer = {textContent: '', title: '', dataset: {}};
const context = {
  window: {},
  document: {getElementById: id => id === 'footerDate' ? footer : null},
  SEED_VERSION: '2026-11-07',
  Date: FixedDate,
  Intl
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('snapshot_freshness.js', 'utf8'), context);

const freshness = context.window.skellSnapshotFreshness;
const result = {
  rendered: {
    text: footer.textContent,
    title: footer.title,
    state: footer.dataset.freshness,
    ageDays: footer.dataset.ageDays
  },
  today: freshness('2026-11-17', new FixedDate('2026-11-17T12:00:00Z')),
  yesterday: freshness('2026-11-16', new FixedDate('2026-11-17T12:00:00Z')),
  future: freshness('2026-11-18', new FixedDate('2026-11-17T12:00:00Z')),
  invalid: freshness('2026-02-30', new FixedDate('2026-11-17T12:00:00Z'))
};
console.log(JSON.stringify(result));
"""
        completed = subprocess.run(
            ["node", "-e", node_test],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        result = json.loads(completed.stdout)

        self.assertEqual(result["rendered"]["state"], "stale")
        self.assertEqual(result["rendered"]["ageDays"], "10")
        self.assertIn("10 DAYS OLD", result["rendered"]["text"])
        self.assertIn("not live until refreshed", result["rendered"]["text"])
        self.assertEqual(result["today"]["state"], "current")
        self.assertEqual(result["today"]["ageDays"], 0)
        self.assertEqual(result["yesterday"]["state"], "stale")
        self.assertEqual(result["yesterday"]["ageDays"], 1)
        self.assertEqual(result["future"]["state"], "future")
        self.assertEqual(result["invalid"]["state"], "unknown")


if __name__ == "__main__":
    unittest.main()
