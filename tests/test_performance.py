"""Deterministic CPU/working-set diagnostics tests."""
import json
import sys
import unittest
from desktop.performance import measure,snapshot

class PerformanceTests(unittest.TestCase):
    def test_invalid_input(self):
        for value in (0,100,True,None,"5"):
            self.assertFalse(measure(value)["ok"])

    def test_sample_math(self):
        clock=[100.]
        counter=[0]
        def source():
            n=counter[0]
            counter[0]+=1
            return {"cpu_seconds":n*.05,"working_set_bytes":(20+n)*1048576,"process_count":2}
        def sleep(n):
            clock[0]+=n
        item=measure(5,sampler=source,sleep=sleep,clock=lambda:clock[0])
        self.assertTrue(item["ok"],item)
        self.assertEqual(item["peak_working_set_mb"],25.0)
        self.assertEqual(item["duration_seconds"],5.0)
        self.assertEqual(item["observed_processes"],2)
        self.assertGreater(item["cpu_percent_all_cores"],0)
        json.dumps(item)

    def test_sample_exception(self):
        def fail():
            raise OSError("blocked")
        self.assertFalse(measure(5,sampler=fail)["ok"])

    @unittest.skipUnless(sys.platform=="win32","Windows-only")
    def test_real_windows_snapshot(self):
        data=snapshot()
        self.assertGreater(data["working_set_bytes"],0)
        self.assertGreater(data["process_count"],0)
