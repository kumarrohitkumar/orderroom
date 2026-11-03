// npm run setup — build is run by the npm script first; this seeds the database.
// Later steps add: write absolute paths into agent/.mcp.json, MCP --selfcheck.
import { dbPath, openDb } from "../src/db/client.js";
import { seed } from "../src/db/seed.js";

const path = dbPath();
const db = openDb(path);
const c = seed(db);
db.close();
console.log(`[setup] seeded ${path}`);
for (const [t, n] of Object.entries(c)) console.log(`  ${t.padEnd(12)} ${n}`);
