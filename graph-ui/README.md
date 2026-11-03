# Original memory graph with slop measurements

This frontend preserves the original graph renderer, sidebar, filters and display
controls. It supports the newer indexer's JSON and paginated RPC responses.

Export saved code-sloppiness runs without scanning source:

```sh
python3 tools/export-slop-index.py --db /path/to/measurements.sqlite3 \
  --project EXACT_INDEXED_PROJECT --run 1 --run 2 > slop-index.json
```

Open **slop index** in the graph and load that JSON. Production and tests stay in
separate runs. Choose duplicate SLOC or high-CC mass; colours use a logarithmic
scale within that run. Blue includes measured zero and grey means unmeasured.
Turning the overlay off restores native colours. Status colouring clears the
overlay; loading slop measurements disables status colouring.

Measurements describe files, including when hovering a function. Coordinates,
sizes, relationships, linked projects and coverage shadows stay unchanged. Partial
coverage, parse gaps and unverified graph revision alignment remain visible with
loaded measurements, even when the controls close. This is advisory TS/JS data,
not correctness findings or authorship detection.

Imports are limited to 32 MiB, stay in memory and clear when projects change.
The exporter preserves scan HEAD, file hashes and engine policy in one read-only
SQLite transaction. The caller-supplied project name must match the selected
project; this does not verify graph revision alignment. No scanner or model runs.
