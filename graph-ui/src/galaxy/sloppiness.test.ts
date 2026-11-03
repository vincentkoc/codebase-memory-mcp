import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { paintSloppiness, readSlopIndex, relativeSlopPath, SLOP_SCHEMA, SLOP_UNKNOWN_COLOR, slopTooltipRows } from './sloppiness';
import type { GraphData } from './types';

export function slopFixture() {
    return { schema: SLOP_SCHEMA, project: 'example', runs: [{ id: 1, created_at: '2026-01-01T00:00:00Z',
        repo: '/example/repository', head: 'a'.repeat(40), digest: 'b'.repeat(64), scope: 'production',
        policy: { scope: 'production', engine: { version: 'fixture' } },
        summary: { coverage: 'partial', files_scanned: 2, parse_failures: ['src/gap.ts'] },
        files: [{ path: 'src/zero.ts', sha256: 'c'.repeat(64), sloc: 30, clone_sloc: 0, mass: 100, complex_mass: 0 },
            { path: 'src/hot.ts', sha256: 'd'.repeat(64), sloc: 30, clone_sloc: 10, mass: 100, complex_mass: 80 }] }] };
}

describe('slop index import', () => {
    it('imports a complete-selected-scope run through the actual SQLite exporter', () => {
        const fixture = slopFixture();
        fixture.runs[0]!.summary.coverage = 'complete-selected-scope';
        fixture.runs[0]!.summary.parse_failures = [];
        const output = execFileSync('python3', ['-c', `
import importlib.util, json, pathlib, sqlite3, sys, tempfile
spec = importlib.util.spec_from_file_location('export_slop', 'tools/export-slop-index.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
fixture = json.load(sys.stdin)
run = fixture['runs'][0]
with tempfile.TemporaryDirectory() as root:
    path = pathlib.Path(root) / 'index.sqlite3'
    with sqlite3.connect(path) as db:
        db.executescript('CREATE TABLE runs(id,created_at,repo,head,digest,policy,summary); CREATE TABLE files(run_id,path,sha256,sloc,clone_sloc,mass,complex_mass);')
        db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?)', (run['id'],run['created_at'],run['repo'],run['head'],run['digest'],json.dumps(run['policy']),json.dumps(run['summary'])))
        for file in run['files']:
            db.execute('INSERT INTO files VALUES(?,?,?,?,?,?,?)', (run['id'],file['path'],file['sha256'],file['sloc'],file['clone_sloc'],file['mass'],file['complex_mass']))
    print(json.dumps(module.export_index(path, fixture['project'], [run['id']])))
`], { input: JSON.stringify(fixture), encoding: 'utf8' });
        expect(readSlopIndex(JSON.parse(output), 'example').runs[0]!.summary.coverage).toBe('complete-selected-scope');
    });
    it('preserves explicit scope, provenance and partial coverage', () => {
        expect(readSlopIndex(slopFixture(), 'example').runs[0]).toMatchObject({ scope: 'production', head: 'a'.repeat(40),
            summary: { coverage: 'partial', parse_failures: ['src/gap.ts'] } });
        expect(() => readSlopIndex(slopFixture(), 'another-project')).toThrow(/project/);
    });
    it.each(['/absolute.ts', '../escape.ts', 'src/../escape.ts', 'src//empty.ts', 'C:/escape.ts', 'src\\file.ts', 'src/./a.ts', 'src/\0a.ts'])('rejects unsafe path %s', path => {
        expect(relativeSlopPath(path)).toBe(false);
        const input = slopFixture(); input.runs[0]!.files[0]!.path = path;
        expect(() => readSlopIndex(input, 'example')).toThrow(/paths/);
    });
    it('rejects duplicate paths, broken counts and nonfinite metrics', () => {
        const duplicate = slopFixture(); duplicate.runs[0]!.files[1]!.path = 'src/zero.ts';
        expect(() => readSlopIndex(duplicate, 'example')).toThrow(/paths/);
        const count = slopFixture(); count.runs[0]!.summary.files_scanned = 3;
        expect(() => readSlopIndex(count, 'example')).toThrow(/coverage/);
        const infinite = slopFixture(); infinite.runs[0]!.files[0]!.mass = Infinity;
        expect(() => readSlopIndex(infinite, 'example')).toThrow(/measurements/);
    });
});

it('changes only primary-node colours; missing measurements differ from measured zero', () => {
    const node = { id: 1, x: 2, y: 3, z: 4, size: 5, label: 'Function', name: 'f', color: '#fff' };
    const graph: GraphData = { nodes: [{ ...node, file_path: 'src/zero.ts' }, { ...node, id: 2, file_path: 'src/hot.ts' },
        { ...node, id: 3, file_path: 'src/gap.ts' }], edges: [{ source: 1, target: 2, type: 'CALLS' }], total_nodes: 3,
        missed_graph: { nodes: [{ ...node, id: 7 }], edges: [], offset: { x: 9, y: 0, z: 0 } } };
    const run = readSlopIndex(slopFixture(), 'example').runs[0]!;
    const painted = paintSloppiness(graph, { project: 'example', run, metric: 'clone_sloc' })!;
    expect(painted.nodes.map(n => n.color)).toEqual(['hsl(220, 80%, 58%)', 'hsl(0, 80%, 58%)', SLOP_UNKNOWN_COLOR]);
    expect(painted.nodes.map(({ color: _color, ...rest }) => rest)).toEqual(graph.nodes.map(({ color: _color, ...rest }) => rest));
    expect(painted.edges).toBe(graph.edges); expect(painted.missed_graph).toBe(graph.missed_graph);
    expect(graph.nodes[0]!.color).toBe('#fff');
    expect(paintSloppiness(graph, { project: 'example', run, metric: 'off' })).toBe(graph);
    expect(slopTooltipRows(undefined)).toEqual([['file slop', 'not measured in this run']]);
    expect(slopTooltipRows(run.files[0])).toContainEqual(['file clone SLOC', '0']);
});
