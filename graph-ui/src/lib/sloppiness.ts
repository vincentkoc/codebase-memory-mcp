import type { GraphData, GraphNode } from './types';

export const SLOP_SCHEMA = 'code-sloppiness.graph.v1';
export const SLOP_UNKNOWN_COLOR = '#64748b';
export type SlopMetric = 'off' | 'clone_sloc' | 'complex_mass';
export interface SlopFile {
    path: string;
    sha256: string;
    sloc: number;
    clone_sloc: number;
    mass: number;
    complex_mass: number;
}
export interface SlopRun {
    id: number;
    created_at: string;
    repo: string;
    head: string;
    digest: string;
    scope: 'production' | 'tests' | 'all';
    policy: Record<string, unknown>;
    summary: Record<string, unknown>;
    files: SlopFile[];
}
export interface SlopIndex { schema: typeof SLOP_SCHEMA; project: string; runs: SlopRun[] }
export interface SlopSelection { project: string; run: SlopRun; metric: SlopMetric }

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function nonnegative(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
export function relativeSlopPath(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && !value.includes('\\')
        && !/[\u0000-\u001f]/.test(value) && !value.startsWith('/')
        && !/^[A-Za-z]:/.test(value) && value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}
function hash(value: unknown): value is string {
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

/** Import measurements only. Source and graph identity are never inferred from paths. */
export function readSlopIndex(value: unknown, project: string): SlopIndex {
    if (!record(value) || value.schema !== SLOP_SCHEMA || value.project !== project
        || !Array.isArray(value.runs) || value.runs.length === 0 || value.runs.length > 100) {
        throw new Error('Slop index schema or selected project does not match.');
    }
    const ids = new Set<number>();
    for (const run of value.runs) {
        if (!record(run) || !Number.isSafeInteger(run.id) || (run.id as number) < 1 || ids.has(run.id as number)
            || typeof run.created_at !== 'string' || typeof run.repo !== 'string' || !run.repo
            || typeof run.head !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(run.head) || !hash(run.digest)
            || !['production', 'tests', 'all'].includes(String(run.scope))
            || !record(run.policy) || run.policy.scope !== run.scope || !record(run.summary)
            || !['complete-selected-scope', 'partial'].includes(String(run.summary.coverage))
            || (run.summary.head !== undefined && run.summary.head !== run.head)
            || (run.summary.content_sha256 !== undefined && run.summary.content_sha256 !== run.digest)
            || !Array.isArray(run.files) || run.files.length > 1_000_000
            || run.summary.files_scanned !== run.files.length) {
            throw new Error('Slop run provenance or coverage is invalid.');
        }
        ids.add(run.id as number);
        const paths = new Set<string>();
        for (const file of run.files) {
            if (!record(file) || !relativeSlopPath(file.path) || paths.has(file.path) || !hash(file.sha256)
                || !Number.isSafeInteger(file.sloc) || !nonnegative(file.sloc)
                || !Number.isSafeInteger(file.clone_sloc) || !nonnegative(file.clone_sloc) || file.clone_sloc > file.sloc
                || !nonnegative(file.mass) || !nonnegative(file.complex_mass) || file.complex_mass > file.mass) {
                throw new Error('Slop file paths or measurements are invalid.');
            }
            paths.add(file.path);
        }
    }
    return value as unknown as SlopIndex;
}

export function slopFiles(run: SlopRun): ReadonlyMap<string, SlopFile> {
    return new Map(run.files.map(file => [file.path, file]));
}
export function nodeSlopFile(node: GraphNode, files: ReadonlyMap<string, SlopFile>): SlopFile | undefined {
    const path = node.file_path;
    return relativeSlopPath(path) ? files.get(path) : undefined;
}
export function paintSloppiness(data: GraphData | undefined, selection: SlopSelection | undefined): GraphData | undefined {
    if (!data || !selection || selection.metric === 'off') return data;
    const metric = selection.metric;
    const files = slopFiles(selection.run);
    const maximum = selection.run.files.reduce((max, file) => Math.max(max, file[metric]), 0);
    return { ...data, nodes: data.nodes.map(node => {
        const file = nodeSlopFile(node, files);
        if (!file) return { ...node, color: SLOP_UNKNOWN_COLOR };
        const pressure = maximum === 0 ? 0 : Math.log1p(file[metric]) / Math.log1p(maximum);
        return { ...node, color: `hsl(${Math.round(220 * (1 - pressure))}, 80%, 58%)` };
    }) };
}

export function slopTooltipRows(file: SlopFile | undefined): [string, string][] {
    if (!file) return [['file slop', 'not measured in this run']];
    return [['file SLOC', String(file.sloc)], ['file clone SLOC', String(file.clone_sloc)],
        ['file high-CC mass', file.complex_mass.toFixed(2)]];
}
