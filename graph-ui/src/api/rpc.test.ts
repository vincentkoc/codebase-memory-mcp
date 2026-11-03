import { afterEach, expect, it, vi } from "vitest";
import { callTool, callToolPages } from "./rpc";

afterEach(() => vi.unstubAllGlobals());

function reply(value: unknown, isError = false) {
  return new Response(JSON.stringify({ result: {
    isError, content: [{ text: typeof value === "string" ? value : JSON.stringify(value) }],
  } }), { headers: { "Content-Type": "application/json" } });
}

it("requests JSON rather than the newer tree-text default", async () => {
  const fetcher = vi.fn().mockResolvedValue(reply({ projects: [] }));
  vi.stubGlobal("fetch", fetcher);
  expect(await callTool("list_projects")).toEqual({ projects: [] });
  expect(JSON.parse(fetcher.mock.calls[0][1].body).params.arguments.format).toBe("json");
});

it("surfaces MCP errors before trying to decode them as JSON", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("project not found", true)));
  await expect(callTool("get_graph_schema")).rejects.toThrow("project not found");
});

it("collects every native page with the returned offset", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(reply({ projects: [{ name: "first" }], has_more: true, next_offset: 1 }))
    .mockResolvedValueOnce(reply({ projects: [{ name: "last" }], has_more: false }));
  vi.stubGlobal("fetch", fetcher);
  const pages = await callToolPages<{ projects: { name: string }[] }>("list_projects");
  expect(pages.flatMap(page => page.projects.map(project => project.name))).toEqual(["first", "last"]);
  expect(JSON.parse(fetcher.mock.calls[1][1].body).params.arguments.offset).toBe(1);
});

it("rejects a nonadvancing cursor", async () => {
  const fetcher = vi.fn().mockResolvedValue(reply({ has_more: true, next_offset: 0 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(callToolPages("list_projects")).rejects.toThrow("pagination cursor");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
