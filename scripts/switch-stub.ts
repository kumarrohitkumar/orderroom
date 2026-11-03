// Dev-only stand-in for Switch's room tools, used by `npm run simulate`. It does NOT talk to any chat;
// it appends what the agent would have posted to data/sim-room.log so a dry run reads like a room.
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod";
import { dataDir } from "../src/db/client.js";

const LOG = join(dataDir(), "sim-room.log");
const room = process.env.SIM_ROOM ?? "room";
const out = (kind: string, body: string) => {
  appendFileSync(LOG, `[${room}] ${kind}\n${body.trim()}\n\n`);
  return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }] };
};

serveStdio(() => {
  const s = new McpServer(
    { name: "switch", version: "0.0.0-stub" },
    { capabilities: { tools: {} } },
  );
  s.registerTool(
    "post_message",
    {
      description: "Post a message to the current room.",
      inputSchema: z.object({ text: z.string() }),
    },
    async ({ text }) => out("post", text),
  );
  s.registerTool(
    "send_targeted_message",
    {
      description: "Post a message that tags specific people (by handle) in the current room.",
      inputSchema: z.object({ target_names: z.array(z.string()), text: z.string() }),
    },
    async ({ target_names, text }) => out(`tag → ${target_names.join(", ")}`, text),
  );
  s.registerTool(
    "send_attachment",
    {
      description: "Upload a file (e.g. a PDF bill) to the current room.",
      inputSchema: z.object({ path: z.string(), caption: z.string().optional() }),
    },
    async ({ path, caption }) => out(`attachment ${path}`, caption ?? ""),
  );
  return s;
});
