// Who is calling: attached to session-aware requests so the engine can bundle
// work per agent session and find it again ("what was I recording?").
import { execFileSync } from "node:child_process";

let cached;

export function callerContext(cwd = process.cwd()) {
  if (cached && cached.cwd === cwd) return cached;
  const env = process.env;
  const git = (...args) => {
    try {
      return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 1500 }).trim();
    } catch {
      return "";
    }
  };
  const root = git("rev-parse", "--show-toplevel");
  const remote = root ? git("remote", "get-url", "origin") : "";
  // git@github.com:owner/name.git or https://github.com/owner/name -> owner/name
  const repo = (/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(remote) ?? [])[1] ?? (root ? root.split("/").pop() : "");
  cached = {
    agent: env.AI_AGENT || (env.CODEX_THREAD_ID ? "codex" : "cli"),
    agent_session_id: env.CLAUDE_CODE_SESSION_ID || env.CODEX_THREAD_ID || env.CODEX_SESSION_ID || "",
    host_session_id: env.CLAUDE_CODE_HOST_SESSION_ID || "",
    cwd,
    repo,
    repo_root: root,
    branch: root ? git("rev-parse", "--abbrev-ref", "HEAD") : "",
  };
  return cached;
}
