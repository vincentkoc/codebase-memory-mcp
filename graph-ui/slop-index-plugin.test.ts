// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ViteDevServer } from "vite";
import { slopIndexPlugin } from "./slop-index-plugin";

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map(done => done())); });

async function fixture(body: string) {
  const directory = await mkdtemp(join(tmpdir(), "saved-slop-test-"));
  const file = join(directory, "scan.json");
  await writeFile(file, body);
  cleanup.push(() => rm(directory, { recursive: true }));
  const plugin = slopIndexPlugin(file);
  const server = createServer();
  const configure = plugin.configureServer as (server: ViteDevServer) => void;
  configure({ middlewares: { use: (handler: Parameters<typeof server.on>[1]) => server.on("request", handler) } } as unknown as ViteDevServer);
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  cleanup.push(() => new Promise<void>((done, fail) => server.close(error => error ? fail(error) : done())));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sloppiness`, file };
}

it("serves configured project metadata and exact bytes without modifying the scan", async () => {
  const body = JSON.stringify({ project: "example", runs: [] });
  const { url, file } = await fixture(body);
  expect(await (await fetch(url)).json()).toEqual({ project: "example" });
  const response = await fetch(`${url}?project=example&file=ignored`);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).toBe(body);
  expect(await readFile(file, "utf8")).toBe(body);
});

it("rejects other projects, foreign origins and mutation methods", async () => {
  const { url } = await fixture('{"project":"example"}');
  expect((await fetch(`${url}?project=other`)).status).toBe(404);
  expect((await fetch(`${url}?project=example`, { headers: { Origin: "https://foreign.invalid" } })).status).toBe(403);
  expect((await fetch(url, { method: "POST" })).status).toBe(405);
});

it("returns a bounded error without exposing configured filesystem paths", async () => {
  const { url, file } = await fixture("invalid json");
  const response = await fetch(url);
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain(file);
});
