import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { readSlopIndex } from '../lib/sloppiness';
import type { SlopIndex, SlopMetric, SlopSelection } from '../lib/sloppiness';

const MAX_IMPORT_BYTES = 32 * 1024 * 1024;

export default function SloppinessControls({ project, resetToken = 0, initialMetric = 'clone_sloc', onChange }: {
    project: string;
    resetToken?: number;
    initialMetric?: SlopMetric;
    onChange: (selection: SlopSelection | undefined) => void;
}): JSX.Element {
    const [index, setIndex] = useState<SlopIndex>();
    const [runId, setRunId] = useState<number>();
    const [metric, setMetric] = useState<SlopMetric>(initialMetric);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [source, setSource] = useState('');
    const [open, setOpen] = useState(false);
    const generation = useRef(0);
    const lastReset = useRef(resetToken);
    useEffect(() => {
        if (lastReset.current !== resetToken) setMetric('off');
        lastReset.current = resetToken;
    }, [resetToken]);
    useEffect(() => {
        const attempt = ++generation.current;
        const controller = new AbortController();
        setLoading(true);
        void (async () => {
            try {
                const response = await fetch(`/api/sloppiness?project=${encodeURIComponent(project)}`, { signal: controller.signal });
                if (response.status === 404) return;
                if (!response.ok) throw new Error('Could not load the saved slop scan.');
                const bytes = await response.arrayBuffer();
                if (bytes.byteLength > MAX_IMPORT_BYTES) throw new Error('Saved slop index exceeds the 32 MiB limit.');
                const loaded = readSlopIndex(JSON.parse(new TextDecoder().decode(bytes)), project);
                if (attempt !== generation.current) return;
                setIndex(loaded);
                setRunId((loaded.runs.find(candidate => candidate.scope === 'production') ?? loaded.runs[0])!.id);
                setSource('loaded automatically');
            } catch (cause) {
                if (attempt === generation.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Cannot read saved slop index.');
            } finally {
                if (attempt === generation.current) setLoading(false);
            }
        })();
        return () => { generation.current++; controller.abort(); };
    }, [project]);
    const run = index?.runs.find(candidate => candidate.id === runId);
    useEffect(() => {
        onChange(run ? { project, run, metric } : undefined);
    }, [project, run, metric, onChange]);

    async function importFile(file: File | undefined): Promise<void> {
        const attempt = ++generation.current;
        setIndex(undefined);
        setRunId(undefined);
        setError('');
        setLoading(false);
        if (!file) return;
        try {
            if (file.size > MAX_IMPORT_BYTES) throw new Error('Slop index exceeds the 32 MiB import limit.');
            const value: unknown = JSON.parse(await file.text());
            const loaded = readSlopIndex(value, project);
            if (attempt !== generation.current) return;
            setIndex(loaded);
            setRunId((loaded.runs.find(candidate => candidate.scope === 'production') ?? loaded.runs[0])!.id);
            setSource('imported file');
        } catch (cause) {
            if (attempt === generation.current) setError(cause instanceof Error ? cause.message : 'Cannot read slop index.');
        }
    }

    return <div className="absolute bottom-4 left-4 z-20 max-w-xl rounded-lg border border-cyan-300/25 bg-[#0b1920]/95 px-4 py-3 text-xs text-white/80 backdrop-blur-sm" aria-label="Slop index overlay">
        <div className="flex items-center justify-between gap-6">
            <strong className="text-sm text-cyan-200">slop overlay{run && metric === 'off' ? ' · off' : ''}</strong>
            <span className="text-[11px] text-white/50">{loading ? 'loading saved scan…' : source}</span>
        </div>
        {run && <div className="mt-3 flex flex-wrap items-center gap-3">
            <label>scope <select className="rounded border border-white/10 bg-[#0b1920] p-1" aria-label="Slop measurement run" value={run.id} onChange={event => setRunId(Number(event.target.value))}>
                {index!.runs.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.scope} · run {candidate.id}</option>)}
            </select></label>
            <label>colour <select className="rounded border border-white/10 bg-[#0b1920] p-1" aria-label="Slop colour metric" value={metric} onChange={event => setMetric(event.target.value as SlopMetric)}>
                <option value="off">off</option><option value="clone_sloc">duplicate SLOC</option><option value="complex_mass">high-CC mass</option>
            </select></label>
        </div>}
        {!run && !loading && !error && <p className="mt-2">no saved scan for this project. import a measurement file below.</p>}
        {error && <p className="mt-2 text-amber-200" role="alert">{error}</p>}
        {run && <>
            <p className="mt-2 text-[11px] text-amber-200/75">{run.scope} · {run.summary.coverage as string} coverage · {run.files.length.toLocaleString()} files
                {' · '}{Array.isArray(run.summary.parse_failures) ? run.summary.parse_failures.length : 'unrecorded'} parse gaps
                {' · scan HEAD '}{run.head.slice(0, 12)}{' · '}{run.created_at}
                {' · engine '}{String((run.policy.engine as Record<string, unknown> | undefined)?.version ?? 'unrecorded')}
                <br />file-level historical measurements · graph revision alignment unverified · advisory TS/JS coverage</p>
            {metric !== 'off' && <div className="mt-3">
                <div className="h-2 rounded" style={{ background: 'linear-gradient(to right, hsl(220,80%,58%), hsl(110,80%,58%), hsl(0,80%,58%))' }} />
                <p className="mt-1">blue → red: increasing {metric === 'clone_sloc' ? 'duplicate SLOC' : 'high-CC mass'} within this run (log scale) · grey: unmeasured</p>
            </div>}
        </>}
        <button className="mt-2 cursor-pointer text-[11px] text-white/40 hover:text-white" type="button" aria-label="Slop index controls" aria-expanded={open} onClick={() => setOpen(value => !value)}>
            {open ? 'hide file import' : 'import another scan…'}
        </button>
        {open && <label className="mt-2 block">measurement file <input className="max-w-xs text-[11px] file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-white/70" type="file" accept=".json,application/json" aria-label="Load slop index"
            onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ''; }} /></label>}
    </div>;
}
