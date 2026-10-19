// `smart-record install`: register the MCP server in Claude Code (user scope)
// and Codex as `mcps/_shared/bin/run smart-record`. Idempotent; repoints an
// older registration in place and backs up each file it changes
// (<file>.bak-smart-record).
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOME = os.homedir();
const NAME = "smart-record";
// The fleet launcher, by its real path (the same form every fleet
// registration uses).
export const LAUNCHER = realpathSync(fileURLToPath(new URL("../../../_shared/bin/run", import.meta.url)));
export const ARGS = [NAME];

function claudeCLI(args) {
  try {
    return { code: 0, out: execFileSync("claude", args, { cwd: HOME, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 }) };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

function claudeCode(dry) {
  const got = claudeCLI(["mcp", "get", NAME]);
  // `claude mcp get` prints the command and its args on separate lines.
  const current = got.code === 0 && got.out.includes(`Command: ${LAUNCHER}`) && got.out.includes(`Args: ${ARGS.join(" ")}\n`);
  if (current) return "already registered";
  if (dry) return `would run: claude mcp add ${NAME} -s user -- ${LAUNCHER} ${ARGS.join(" ")}`;
  if (got.code === 0) claudeCLI(["mcp", "remove", NAME, "-s", "user"]);
  const r = claudeCLI(["mcp", "add", NAME, "-s", "user", "--", LAUNCHER, ...ARGS]);
  if (r.code !== 0) throw new Error(`claude mcp add failed: ${r.out.trim()}`);
  return "registered (user scope)";
}

function codex(dry) {
  const file = path.join(HOME, ".codex", "config.toml");
  if (!existsSync(path.dirname(file))) return "codex not installed";
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const command = `command = "${LAUNCHER}"\nargs = ${JSON.stringify(ARGS)}`;
  const header = `[mcp_servers.${NAME}]`;
  const at = text.indexOf(header);
  if (at >= 0) {
    // Repoint an existing block's command and args; keep its other keys
    // (timeouts, env).
    const rest = text.slice(at + header.length);
    const end = at + header.length + (rest.search(/\n\[/) >= 0 ? rest.search(/\n\[/) : rest.length);
    const body = text.slice(at + header.length, end);
    const kept = body.split("\n").filter((line) => !/^\s*(command|args)\s*=/.test(line));
    const next = `${header}\n${command}${kept.join("\n").replace(/^\n*/, "\n")}`;
    if (text.slice(at, end) === next) return "already registered";
    if (dry) return `would repoint ${header} in ${file} to: ${command}`;
    copyFileSync(file, `${file}.bak-smart-record`);
    writeFileSync(file, text.slice(0, at) + next + text.slice(end));
    return `repointed in ${file}`;
  }
  // record_wait can block for up to an hour.
  const block = `\n${header}\n${command}\ntool_timeout_sec = 3700.0\n`;
  if (dry) return `would add to ${file}:${block}`;
  if (existsSync(file)) copyFileSync(file, `${file}.bak-smart-record`);
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
