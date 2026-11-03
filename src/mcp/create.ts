import { McpServer } from "@modelcontextprotocol/server";
import { registerTools } from "./tools.js";

export const VERSION = "0.1.0";

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "orderroom", version: VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        "OrderRoom order desk for an FMCG distributor. Resolve parties and products with find_* first, then use the write tools. Rules (credit, stock, roles) are enforced here; relay refusals and their next_step, never work around them.",
    },
  );
  registerTools(server);
  return server;
}
