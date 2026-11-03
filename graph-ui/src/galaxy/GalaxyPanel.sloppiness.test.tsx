// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import GalaxyPanel from './GalaxyPanel';
import type { GraphData } from './types';
import { SLOP_SCHEMA, SLOP_UNKNOWN_COLOR } from './sloppiness';

vi.mock('./GraphScene', async importOriginal => ({ ...await importOriginal<typeof import('./GraphScene')>(),
    GraphScene: ({ data }: { data: GraphData }) => <output data-testid="slop-scene">{JSON.stringify(data.nodes.map(node => node.color))}</output> }));

it('imports separate scopes, switches metrics and clears measurements on project navigation', async () => {
    (globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    const node = { id: 1, name: 'a', label: 'Function', file_path: 'src/a.ts', x: 1, y: 2, z: 3, size: 1, color: '#ffffff' };
    const fetchLayout = vi.fn(async () => new Response(JSON.stringify({ nodes: [node], edges: [], total_nodes: 1 })));
    const run = (id: number, scope: string, path: string) => ({ id, scope, created_at: '2026-01-01T00:00:00Z',
        repo: '/example/repository', head: 'a'.repeat(40), digest: 'b'.repeat(64), policy: { scope },
        summary: { coverage: 'partial', files_scanned: 1 },
        files: [{ path, sha256: 'c'.repeat(64), sloc: 20, clone_sloc: 0, mass: 100, complex_mass: 50 }] });
    const payload = { schema: SLOP_SCHEMA, project: 'example', runs: [run(1, 'production', 'src/a.ts'), run(2, 'tests', 'test/a.test.ts')] };
    const colours = () => host.querySelector('[data-testid="slop-scene"]')?.textContent;
    async function choose(payloadText: string) {
        if (!host.querySelector('[aria-label="Load slop index"]')) {
            await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Slop index controls"]')!.click());
        }
        const file = new File([payloadText], 'slop.json', { type: 'application/json' });
        Object.defineProperty(file, 'text', { value: async () => payloadText });
        const input = host.querySelector<HTMLInputElement>('[aria-label="Load slop index"]')!;
        Object.defineProperty(input, 'files', { value: [file], configurable: true });
        await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    }
    async function select(label: string, value: string) {
        const input = host.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
        await act(async () => { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); });
    }
    try {
        await act(async () => root.render(<GalaxyPanel project="example" visible onOpenNode={vi.fn()} fetch={fetchLayout} />));
        await vi.waitFor(() => expect(colours()).toBe('["#ffffff"]'));
        await choose(JSON.stringify(payload));
        await vi.waitFor(() => expect(colours()).toContain('hsl(220'));
        expect(host.textContent).toContain('partial coverage');
        expect(host.textContent).toContain('revision alignment unverified');
        await select('Slop colour metric', 'complex_mass');
        expect(colours()).toContain('hsl(0');
        await select('Slop measurement run', '2');
        expect(colours()).toBe(JSON.stringify([SLOP_UNKNOWN_COLOR]));
        await select('Slop colour metric', 'off');
        expect(colours()).toBe('["#ffffff"]');
        await choose('{broken');
        expect(host.querySelector('[role="alert"]')).not.toBeNull();
        expect(colours()).toBe('["#ffffff"]');
        await choose(JSON.stringify(payload));
        await act(async () => root.render(<GalaxyPanel project="other" visible onOpenNode={vi.fn()} fetch={fetchLayout} />));
        await vi.waitFor(() => expect(colours()).toBe('["#ffffff"]'));
        expect(host.querySelector('[aria-label="Slop measurement run"]')).toBeNull();
        await choose(JSON.stringify(payload));
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('project');
    } finally {
        await act(async () => root.unmount()); host.remove(); globalThis.__atlasGalaxy = undefined;
    }
});
