import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { GraphTab } from "./GraphTab";
import type { GraphData, GraphNode } from "../lib/types";
import { SLOP_SCHEMA, SLOP_UNKNOWN_COLOR } from "../lib/sloppiness";

const tooltip = vi.hoisted(() => ({ render: undefined as ((node: GraphNode) => ReactElement<{ slop?: unknown }>) | undefined }));
vi.mock("./GraphScene", () => ({
  GraphScene: ({ data, renderTooltip }: { data: GraphData; renderTooltip: typeof tooltip.render }) => {
    tooltip.render = renderTooltip;
    return <div data-testid="scene" data-colours={JSON.stringify(data.nodes.map(node => node.color))} />;
  },
  computeCameraTarget: () => null,
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("keeps the original graph controls and geometry while switching measured scopes", async () => {
  const graph: GraphData = { total_nodes: 1, edges: [], nodes: [
    { id: 1, x: 2, y: 3, z: 4, size: 1, label: "File", name: "a.ts", file_path: "src/a.ts", color: "#ffffff" },
  ] };
  const linked = { ...graph.nodes[0], x: 100, color: "#123456" } as GraphNode;
  graph.linked_projects = [{ project: "other", nodes: [linked], edges: [], cross_edges: [], offset: { x: 100, y: 0, z: 0 } }];
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => new Response(
    JSON.stringify(String(url).startsWith("/api/layout") ? graph : {}),
  )));
  const run = { id: 1, created_at: "2026-01-01", repo: "/example/repository", head: "a".repeat(40),
    digest: "b".repeat(64), scope: "production", policy: { scope: "production" },
    summary: { coverage: "partial", files_scanned: 1, parse_failures: ["src/gap.ts"] },
    files: [{ path: "src/a.ts", sha256: "c".repeat(64), sloc: 20, clone_sloc: 10, mass: 50, complex_mass: 20 }] };
  const payload = { schema: SLOP_SCHEMA, project: "example", runs: [run,
    { ...run, id: 2, scope: "tests", policy: { scope: "tests" }, files: [], summary: { ...run.summary, files_scanned: 0 } },
  ] };
  const view = render(<GraphTab project="example" />);
  await screen.findByText("Filters");
  fireEvent.click(screen.getByLabelText("Slop index controls"));
  const file = new File([JSON.stringify(payload)], "slop.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => JSON.stringify(payload) });
  fireEvent.change(screen.getByLabelText("Load slop index"), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByTestId("scene").dataset.colours).toContain("hsl(0"));
  expect(tooltip.render!(linked).props.slop).toBeUndefined();
  expect(screen.getByText("Filters")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Slop index controls"));
  expect(screen.queryByLabelText("Load slop index")).toBeNull();
  expect(screen.getByText(/partial coverage/)).toBeInTheDocument();
  expect(screen.getByText(/graph revision alignment unverified/)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Slop index controls"));
  fireEvent.change(screen.getByLabelText("Slop measurement run"), { target: { value: "2" } });
  await waitFor(() => expect(screen.getByTestId("scene").dataset.colours).toContain(SLOP_UNKNOWN_COLOR));
  fireEvent.change(screen.getByLabelText("Slop colour metric"), { target: { value: "off" } });
  await waitFor(() => expect(screen.getByTestId("scene").dataset.colours).toBe('["#ffffff"]'));
  fireEvent.change(screen.getByLabelText("Slop colour metric"), { target: { value: "clone_sloc" } });
  fireEvent.click(screen.getByRole("button", { name: "Color by status" }));
  expect(screen.queryByLabelText("Slop measurement run")).toBeNull();
  view.rerender(<GraphTab project="other" />);
  await waitFor(() => expect(screen.getByTestId("scene").dataset.colours).toBe('["#334155"]'));
  expect(screen.queryByLabelText("Slop measurement run")).toBeNull();
});
