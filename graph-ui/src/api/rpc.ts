/* JSON-RPC client — speaks the same protocol as MCP clients via POST /rpc */

let _nextId = 1;

export class RpcError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export async function callTool<T = unknown>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch("/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: _nextId++,
      method: "tools/call",
      params: { name, arguments: { ...args, format: "json" } },
    }),
  });

  if (!res.ok) {
    throw new RpcError(-1, `HTTP ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();

  if (json.error) {
    throw new RpcError(json.error.code ?? -1, json.error.message ?? "unknown");
  }

  /* MCP tool results are wrapped: { result: { content: [{ text: "..." }] } } */
  const text = json?.result?.content?.[0]?.text;
  if (json?.result?.isError) {
    throw new RpcError(-1, typeof text === "string" ? text : "Tool request failed");
  }
  if (text === undefined) {
    return json.result as T;
  }

  return JSON.parse(text) as T;
}

export async function callToolPages<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T[]> {
  const pages: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await callTool<T & { has_more?: boolean; next_offset?: number }>(
      name, { ...args, limit: 100, offset },
    );
    pages.push(page);
    if (!page.has_more) return pages;
    const next = page.next_offset;
    if (!Number.isSafeInteger(next) || next! <= offset) {
      throw new RpcError(-1, "Invalid pagination cursor");
    }
    offset = next!;
  }
}
