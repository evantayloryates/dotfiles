// `record-screen install`: register the MCP server in Claude Code (user scope)
// and Codex. Idempotent; backs up each file it changes
// (<file>.bak-record-screen).
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = os.homedir();
const NAME = "record-screen";
export const LAUNCHER = path.join(HOME, "dotfiles", "src", "record-screen", "bin", "record-screen-mcp");

function claudeCLI(args) {
  try {
    return { code: 0, out: execFileSync("claude", args, { cwd: HOME, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 }) };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

function claudeCode(dry) {
  const got = claudeCLI(["mcp", "get", NAME]);
  if (got.code === 0 && got.out.includes(LAUNCHER)) return "already registered";
  if (dry) return `would run: claude mcp add ${NAME} -s user -- ${LAUNCHER}`;
  if (got.code === 0) claudeCLI(["mcp", "remove", NAME, "-s", "user"]);
  const r = claudeCLI(["mcp", "add", NAME, "-s", "user", "--", LAUNCHER]);
  if (r.code !== 0) throw new Error(`claude mcp add failed: ${r.out.trim()}`);
  return "registered (user scope)";
}

function codex(dry) {
  const file = path.join(HOME, ".codex", "config.toml");
  if (!existsSync(path.dirname(file))) return "codex not installed";
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (text.includes(`[mcp_servers.${NAME}]`)) return text.includes(LAUNCHER) ? "already registered" : "present with a different command; left alone";
  // record_wait can block for up to an hour.
  const block = `\n[mcp_servers.${NAME}]\ncommand = "${LAUNCHER}"\ntool_timeout_sec = 3700.0\n`;
  if (dry) return `would add to ${file}:${block}`;
  if (existsSync(file)) copyFileSync(file, `${file}.bak-record-screen`);
  // Keep it next to the other [mcp_servers.*] tables.
  const lastMcp = text.lastIndexOf("[mcp_servers.");
  let out = text + block;
  if (lastMcp >= 0) {
    const after = text.slice(lastMcp).search(/\n\[(?!mcp_servers)[^\]]+\]/);
    if (after >= 0) out = text.slice(0, lastMcp + after) + block + text.slice(lastMcp + after);
  }
  writeFileSync(file, out);
  return `registered in ${file}`;
}

export function install({ dry = false } = {}) {
  if (!existsSync(LAUNCHER)) throw new Error(`launcher missing: ${LAUNCHER}`);
  const out = {};
  for (const [name, fn] of [["claude-code", claudeCode], ["codex", codex]]) {
    try {
      out[name] = fn(dry);
    } catch (err) {
      out[name] = `FAILED: ${err.message}`;
    }
  }
  return out;
}
