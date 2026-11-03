import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("export_slop", Path(__file__).with_name("export-slop-index.py"))
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


class ExportSlopTest(unittest.TestCase):
    def test_missing_database_is_not_created(self):
        with tempfile.TemporaryDirectory() as root:
            missing = Path(root) / "absent.sqlite3"
            with self.assertRaises(FileNotFoundError):
                exporter.export_index(missing, "example", [1])
            self.assertFalse(missing.exists())

    def test_explicit_scopes_preserve_provenance_and_database(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "measurements.sqlite3"
            with sqlite3.connect(path) as db:
                db.executescript("CREATE TABLE runs(id,created_at,repo,head,digest,policy,summary);"
                                 "CREATE TABLE files(run_id,path,sha256,sloc,clone_sloc,mass,complex_mass);")
                for run_id, scope in [(1, "production"), (2, "tests")]:
                    db.execute("INSERT INTO runs VALUES(?,?,?,?,?,?,?)", (
                        run_id, "2026-01-01T00:00:00Z", "/example/repository", "a" * 40, "b" * 64,
                        json.dumps({"scope": scope, "engine": {"version": "fixture"}}),
                        json.dumps({"files_scanned": 1, "coverage": "partial", "parse_failures": ["src/gap.ts"]})))
                    db.execute("INSERT INTO files VALUES(?,?,?,?,?,?,?)", (run_id, "src/a.ts", "c" * 64, 12, 0, 20.0, 10.0))
            before = hashlib.sha256(path.read_bytes()).hexdigest()
            output = exporter.export_index(path, "example", [1, 2])
            self.assertEqual([run["scope"] for run in output["runs"]], ["production", "tests"])
            self.assertEqual(output["runs"][0]["summary"]["parse_failures"], ["src/gap.ts"])
            self.assertEqual(output["runs"][0]["files"][0]["clone_sloc"], 0)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)
            with self.assertRaisesRegex(ValueError, "does not exist"):
                exporter.export_index(path, "example", [99])
            with self.assertRaisesRegex(ValueError, "distinct"):
                exporter.export_index(path, "example", [1, 1])
            with sqlite3.connect(path) as db:
                db.execute("UPDATE runs SET summary=? WHERE id=1", (json.dumps({"files_scanned": 2}),))
            with self.assertRaisesRegex(ValueError, "coverage"):
                exporter.export_index(path, "example", [1])


if __name__ == "__main__":
    unittest.main()
