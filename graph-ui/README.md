# Original memory graph with slop measurements

This frontend preserves the original graph renderer, sidebar, filters and display
controls. It supports the newer indexer's JSON and paginated RPC responses.

Export saved code-sloppiness runs without scanning source:

```sh
python3 tools/export-slop-index.py --db /path/to/measurements.sqlite3 \
  --project EXACT_INDEXED_PROJECT --run 1 --run 2 > slop-index.json
```

For automatic loading in the development viewer, configure that saved JSON:

```sh
CBM_SLOP_INDEX_FILE=/path/to/slop-index.json npm run dev
```

The graph loads the saved scan on every visit, selects production first and shows
the scope selector, colour selector and legend immediately. A bare `?tab=graph`
URL opens the configured scan's project. Only that explicitly configured file is
served, through a read-only endpoint; requests cannot select filesystem paths.
The production frontend needs a server providing the same `/api/sloppiness`
endpoint, or users can choose **import another scan** to load JSON manually.

Production and tests stay in separate runs. Choose duplicate SLOC or high-CC
mass; colours use a logarithmic scale within that run. Blue includes measured
zero and grey means unmeasured. Turning the overlay off restores native colours.
Status colouring turns the overlay off while keeping the measurements available;
choosing a slop colour disables status colouring.

Measurements describe files, including when hovering a function. Coordinates,
sizes, relationships, linked projects and coverage shadows stay unchanged. Partial
coverage, parse gaps and unverified graph revision alignment remain visible with
loaded measurements, even when the controls close. This is advisory TS/JS data,
not correctness findings or authorship detection.

Imports are limited to 32 MiB, stay in memory and clear when projects change.
Saved scans reload automatically; manual imports are not persisted.
The exporter preserves scan HEAD, file hashes and engine policy in one read-only
SQLite transaction. The caller-supplied project name must match the selected
project; this does not verify graph revision alignment. No scanner or model runs.
