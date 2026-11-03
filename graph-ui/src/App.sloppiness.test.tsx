import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./components/GraphTab", () => ({ GraphTab: ({ project }: { project: string | null }) => <div>{project ?? "no project"}</div> }));
vi.mock("./components/StatsTab", () => ({ StatsTab: () => <div>projects</div> }));
vi.mock("./components/ControlTab", () => ({ ControlTab: () => <div>control</div> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("opens the saved scan project from a bare graph URL and preserves it on reload", async () => {
  window.history.replaceState(null, "", "/?tab=graph");
  const fetcher = vi.fn(async (_url: RequestInfo | URL) => new Response('{"project":"example"}'));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<App />);
  await waitFor(() => expect(window.location.search).toBe("?tab=graph&project=example"));
  expect(screen.getAllByText("example")).toHaveLength(2);
  view.unmount();
  render(<App />);
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/sloppiness")).toHaveLength(1);
});

it("does not replace an explicitly selected project", async () => {
  window.history.replaceState(null, "", "/?tab=graph&project=selected");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<App />);
  expect(screen.getAllByText("selected")).toHaveLength(2);
  expect(fetcher).not.toHaveBeenCalled();
});
