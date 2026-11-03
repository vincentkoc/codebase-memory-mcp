import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import SloppinessControls from "./SloppinessControls";
import { SLOP_SCHEMA } from "../lib/sloppiness";

const run = { id: 1, created_at: "2026-01-01", repo: "/example/repository", head: "a".repeat(40),
  digest: "b".repeat(64), scope: "production", policy: { scope: "production" },
  summary: { coverage: "partial", files_scanned: 0, parse_failures: [] }, files: [] };
const payload = { schema: SLOP_SCHEMA, project: "example", runs: [
  { ...run, id: 2, scope: "tests", policy: { scope: "tests" } }, run,
] };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("loads the saved production scan on every mount with visible controls and legend", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify(payload)));
  vi.stubGlobal("fetch", fetcher);
  const onChange = vi.fn();
  const view = render(<SloppinessControls project="example" onChange={onChange} />);
  await screen.findByText("loaded automatically");
  expect(screen.getByLabelText("Slop measurement run")).toHaveValue("1");
  expect(screen.getByLabelText("Slop colour metric")).toHaveValue("clone_sloc");
  expect(screen.getByText(/blue → red/)).toBeVisible();
  expect(screen.queryByLabelText("Load slop index")).toBeNull();
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ run: expect.objectContaining({ id: 1 }), metric: "clone_sloc" }));
  view.unmount();
  render(<SloppinessControls project="example" onChange={onChange} />);
  await screen.findByText("loaded automatically");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("keeps the scan loaded when status coloring turns the overlay off", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload))));
  const onChange = vi.fn();
  const view = render(<SloppinessControls project="example" resetToken={0} onChange={onChange} />);
  await screen.findByText("loaded automatically");
  view.rerender(<SloppinessControls project="example" resetToken={1} onChange={onChange} />);
  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ metric: "off" })));
  expect(screen.getByLabelText("Slop measurement run")).toHaveValue("1");
  fireEvent.change(screen.getByLabelText("Slop colour metric"), { target: { value: "complex_mass" } });
  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ metric: "complex_mass" })));
});

it("does not replace an imported scan with a late automatic response", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; })));
  const onChange = vi.fn();
  render(<SloppinessControls project="example" onChange={onChange} />);
  fireEvent.click(screen.getByLabelText("Slop index controls"));
  const imported = { ...payload, runs: [{ ...run, id: 3 }] };
  const file = new File([], "scan.json");
  Object.defineProperty(file, "text", { value: async () => JSON.stringify(imported) });
  fireEvent.change(screen.getByLabelText("Load slop index"), { target: { files: [file] } });
  await screen.findByText("imported file");
  await act(async () => { resolve(new Response(JSON.stringify(payload))); });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ run: expect.objectContaining({ id: 3 }) }));
  expect(screen.getByText("imported file")).toBeVisible();
});

it("rejects a saved scan for another project and keeps manual import available", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...payload, project: "other" }))));
  const onChange = vi.fn();
  render(<SloppinessControls project="example" onChange={onChange} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(/project does not match/);
  expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ run: expect.anything() }));
  fireEvent.click(screen.getByLabelText("Slop index controls"));
  expect(screen.getByLabelText("Load slop index")).toBeVisible();
});
