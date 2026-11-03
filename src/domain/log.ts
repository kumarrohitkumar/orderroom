// JSON lines to stderr only. stdout belongs to the MCP stdio transport.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

function threshold(): number {
  const l = (process.env.ORDERROOM_LOG ?? "info") as Level;
  return LEVELS[l] ?? LEVELS.info;
}

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  if (LEVELS[level] < threshold()) return;
  process.stderr.write(
    `${JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields })}\n`,
  );
}
