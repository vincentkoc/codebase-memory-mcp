import { readFile, stat } from "node:fs/promises";
import type { Plugin } from "vite";

const MAX_BYTES = 32 * 1024 * 1024;
const origins = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);

/** Serve only the explicitly configured measurement file, never a request path. */
export function slopIndexPlugin(file: string | undefined): Plugin {
  return {
    name: "saved-slop-index",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== "/api/sloppiness") return next();
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json");
        if (req.headers.origin && !origins.has(req.headers.origin)) {
          res.statusCode = 403;
          return res.end('{"error":"forbidden origin"}');
        }
        if (req.method !== "GET") {
          res.statusCode = 405;
          return res.end('{"error":"GET required"}');
        }
        if (!file) {
          res.statusCode = 404;
          return res.end('{"error":"no saved slop scan"}');
        }
        try {
          const info = await stat(file);
          if (!info.isFile() || info.size > MAX_BYTES) throw new Error("invalid scan file");
          const bytes = await readFile(file);
          if (bytes.length > MAX_BYTES) throw new Error("scan too large");
          const index = JSON.parse(bytes.toString("utf8")) as { project?: unknown };
          if (typeof index.project !== "string" || !index.project) throw new Error("missing project");
          const project = url.searchParams.get("project");
          if (project === null) return res.end(JSON.stringify({ project: index.project }));
          if (project !== index.project) {
            res.statusCode = 404;
            return res.end('{"error":"no saved scan for this project"}');
          }
          res.end(bytes);
        } catch {
          res.statusCode = 500;
          res.end('{"error":"saved slop scan could not be read"}');
        }
      });
    },
  };
}
