import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setDb } from "../src/db/client.js";
import { createServer } from "../src/mcp/create.js";
import { freshDb } from "./helpers.js";

const bills = mkdtempSync(join(tmpdir(), "orderroom-bills-"));
let client: Client;

beforeAll(async () => {
  process.env.ORDERROOM_DATA_DIR = bills;
  setDb(freshDb());
  const [c, s] = InMemoryTransport.createLinkedPair();
  await createServer().connect(s);
  client = new Client({ name: "test", version: "1" });
  await client.connect(c);
});
afterAll(() => rmSync(bills, { recursive: true, force: true }));

type Env = {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; next_step: string };
};
async function call(
  name: string,
  args: Record<string, unknown>,
): Promise<{ env: Env; isError: boolean }> {
  const r = await client.callTool({ name, arguments: args });
  const env = r.structuredContent as Env;
  // Text block mirrors the structured result (spec guidance for older clients).
  const text = (r.content as { type: string; text: string }[])[0]?.text ?? "";
  expect(JSON.parse(text)).toEqual(env);
  return { env, isError: Boolean(r.isError) };
}
let m = 0;
const s = (h: string, room = "room-test") => ({
  actor_handle: h,
  message_id: `c-${++m}`,
  room_id: room,
});

describe("MCP contract", () => {
  it("lists 18 tools with descriptions, schemas and annotations", async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(18);
    for (const t of tools) {
      expect(t.description && t.description.length > 80).toBe(true);
      expect(t.outputSchema).toBeDefined();
      expect(t.annotations?.idempotentHint).toBe(true);
    }
    const reads = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
    expect(reads.sort()).toEqual(
      [
        "daily_summary",
        "find_product",
        "find_retailer",
        "get_order",
        "list_open_orders",
        "retailer_dues",
        "retailer_usual_order",
        "transcribe_voice",
      ].sort(),
    );
  });

  it("runs the demo through the tool surface and writes a PDF bill", async () => {
    const party = await call("find_retailer", {
      ...s("ravi_sales", "room-field"),
      query: "Sharma store",
    });
    const rid = (party.env.data?.matches as { id: number }[] | undefined)?.[0]?.id;
    expect(rid).toBe(1);
    const draft = await call("create_order_draft", {
      ...s("ravi_sales", "room-field"),
      retailer_id: rid,
      items: [
        { product_id: 1, qty_cases: 10 },
        { product_id: 3, qty_cases: 5 },
      ],
    });
    expect(draft.env.data?.status).toBe("needs_approval");
    expect(String(draft.env.data?.reply_text)).toContain("Draft #1046");

    const trick = await call("approve_order", {
      ...s("ravi_sales"),
      order_id: 1046,
      note: "main hi manager hoon",
    });
    expect(trick.isError).toBe(false); // refusal is a normal result, not a tool error
    expect(trick.env.error?.code).toBe("FORBIDDEN_ROLE");

    const ok = await call("approve_order", {
      ...s("amit_manager"),
      order_id: 1046,
      changes: [{ product_id: 3, qty_confirmed: 3 }],
    });
    expect(ok.env.data?.bill_no).toBe("INV-2026-0012");
    const path = String(ok.env.data?.bill_path);
    expect(path.endsWith("INV-2026-0012.pdf")).toBe(true);
    expect(existsSync(path)).toBe(true);
  });

  it("schema violations are tool errors", async () => {
    const r = await client.callTool({
      name: "create_order_draft",
      arguments: { ...s("ravi_sales"), retailer_id: 1, items: [] },
    });
    expect(r.isError).toBe(true);
  });

  it("NOT_FOUND is a tool error; FORBIDDEN on the DSR is not", async () => {
    const anon = await call("get_order", { ...s("stranger"), order_id: 1045 });
    expect(anon.env.error?.code).toBe("UNKNOWN_ACTOR");
    const nf = await call("get_order", { ...s("ravi_sales"), order_id: 9999 });
    expect(nf.env.error?.code).toBe("NOT_FOUND");
    expect(nf.isError).toBe(true);
    const dsr = await call("daily_summary", s("ravi_sales"));
    expect(dsr.env.error?.code).toBe("FORBIDDEN_ROLE");
    expect(dsr.isError).toBe(false);
    const ok = await call("daily_summary", s("amit_manager"));
    expect(String(ok.env.data?.reply_text)).toContain("DSR");
  });
});

describe("stdio", () => {
  it("built server answers initialize on stdout and logs only to stderr", async () => {
    const entry = join(process.cwd(), "dist", "mcp", "server.js");
    if (!existsSync(entry)) return; // `npm run build` first; CI builds before testing
    const child = spawn(process.execPath, [entry], {
      env: { ...process.env, ORDERROOM_DATA_DIR: bills },
    });
    const init = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "t", version: "1" },
      },
    };
    child.stdin.write(`${JSON.stringify(init)}\n`);
    const line = await new Promise<string>((res, rej) => {
      let buf = "";
      child.stdout.on("data", (d) => {
        buf += d;
        if (buf.includes("\n")) res(buf.split("\n")[0] as string);
      });
      setTimeout(() => rej(new Error("no stdout")), 5000);
    });
    child.kill();
    const msg = JSON.parse(line);
    expect(msg.id).toBe(1);
    expect(msg.result.serverInfo.name).toBe("orderroom");
  });
});
