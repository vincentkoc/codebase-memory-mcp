#!/usr/bin/env python3
"""Export selected, existing code-sloppiness runs for the local Galaxy overlay."""
import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import sys


def export_index(database, project, run_ids):
    database = Path(database).expanduser().resolve(strict=True)
    if not project or not run_ids or len(set(run_ids)) != len(run_ids):
        raise ValueError("name the indexed project and distinct explicit run IDs")
    with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)) as db:
        db.row_factory = sqlite3.Row
        db.execute("BEGIN")
        runs = []
        repository = None
        for run_id in run_ids:
            row = db.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
            if row is None:
                raise ValueError("measurement run does not exist: " + str(run_id))
            run = dict(row)
            run["policy"] = json.loads(run["policy"])
            run["summary"] = json.loads(run["summary"])
            run["scope"] = run["policy"]["scope"]
            if repository is not None and run["repo"] != repository:
                raise ValueError("selected runs belong to different repositories")
            repository = run["repo"]
            run["files"] = [dict(file) for file in db.execute(
                "SELECT path,sha256,sloc,clone_sloc,mass,complex_mass "
                "FROM files WHERE run_id=? ORDER BY path", (run_id,)
            )]
            if len(run["files"]) != run["summary"]["files_scanned"]:
                raise ValueError("stored file coverage differs from the run summary")
            runs.append(run)
    return {"schema": "code-sloppiness.graph.v1", "project": project, "runs": runs}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--project", required=True, help="exact existing CBM project name")
    parser.add_argument("--run", type=int, action="append", required=True, help="repeat for separate scopes")
    args = parser.parse_args()
    try:
        result = export_index(args.db, args.project, args.run)
        json.dump(result, sys.stdout, allow_nan=False, separators=(",", ":"))
        sys.stdout.write("\n")
    except (OSError, ValueError, KeyError, sqlite3.Error) as error:
        parser.exit(2, "slop export: " + str(error) + "\n")


if __name__ == "__main__":
    main()
