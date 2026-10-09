#!/usr/bin/env node
// record-screen: command line for the capture engine. Prints JSON.
//
//   record-screen status            engine, permission, clock and displays
//   record-screen windows <json>    explicit bounded discovery, including include_transients
//   record-screen ping              socket round trip in ms
//   record-screen grant             ask macOS for Screen Recording (prompts once)
//   record-screen probe             prove ScreenCaptureKit works, with timings
//   record-screen restart           restart the LaunchAgent and wait for it
//   record-screen build             rebuild if sources changed, then restart
//   record-screen wait [seconds]    wait until the engine answers
//   record-screen logs [n]          last n engine log lines (default 20)
//   record-screen windows [app] [title]        list windows (window ids for targets)
//   record-screen production-plan <json>       read-only expectations/cost/recovery assessment
//   record-screen verify <target> [max_width]  capture the target, print image path and checks
//   record-screen outline <target> [label] [seconds]   draw the frame outline (0 s = until hidden)
//   record-screen outline-off                  hide all outlines
//   record-screen record <target> <start> <end> [preset] [label] (--session <id> | --new <title>)
//                                              schedule a recording; times are ISO 8601,
//                                              unix seconds, or +N[s|m|h] from now (CLI only)
//   record-screen recordings [state]           list recordings, newest first
//   record-screen recording <id>               full manifest of one recording
//   record-screen record-source <id>           local source journal and gap descriptor
//   record-screen frame-map <json>             actual mux/source geometry and desktop-point/region projection
//   record-screen input-query <json>           bounded retained events, reasons/gaps and exact receipt offsets
//   record-screen action-begin <json>          recorder-stamped contextual block, no UI action
//   record-screen action-end <json>            close token, caller-reported result
//   record-screen action-scopes <session> [caller]  scoped token recovery
//   record-screen record-wait <id> [recording|done] [timeout_s]
//   record-screen stop <id>                    stop now, keep the file
//   record-screen cancel <id>                  stop or unschedule, delete the file
//   record-screen sessions [query] [--mine]    search sessions (newest activity first);
//                                              --mine filters on this agent's claimed id
//   record-screen session <id>                 manifest, recordings and recent events
//   record-screen session-new <title> [purpose]
//   record-screen note <session_id> <text>     breadcrumb in the session log
//   record-screen mark <label> <rec_… | ses_…> mark now in one recording, or all running in a session
//   record-screen close <session_id>
//   record-screen install [--dry-run]           register the MCP server in Claude Code and Codex
//   record-screen call <method> [json-params]
//
// <target> shorthand: display | display:<id> | rect:x,y,w,h | window:<id> |
// app:<bundle id or name>[/<title words>] | a JSON object
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callerContext } from "./lib/caller.mjs";
import { prepareMaintenance, validateMaintenance, releaseMaintenance } from "./lib/maintenance.mjs";
import { install } from "./lib/install.mjs";
import { planProduction, validateProductionRequest } from "./lib/production-plan.mjs";
import { mapRecordingFrames, validateFrameMapRequest } from "./lib/frame-map.mjs";
import { validateWindowQuery, requireTransientInventory } from "./lib/window-query.mjs";
import {queryRecordingInput,validateInputQuery} from "./lib/input-query.mjs";
import { requireCaptureOptions } from "./lib/capture-options.mjs";
import { call as rawCall, enginePaths, EngineError, LABEL } from "./lib/client.mjs";

// Session-aware methods get the caller attached, so work bundles per agent
// session without passing ids around.
const WITH_CALLER = /^(record\.schedule|session\.create)$/;
const call = async (method, params = {}, opts) => {
  if (params.target && Object.hasOwn(params.target, "include_apps")) requireCaptureOptions(await rawCall("status", {}, opts), params.target);
  return rawCall(method, WITH_CALLER.test(method) && !params.caller ? { ...params, caller: callerContext() } : params, opts);
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
process.stdout.on("error", (e) => process.exit(e.code === "EPIPE" ? 0 : 1));
const out = (v) => process.stdout.write(JSON.stringify(v, null, 2) + "\n");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUp(seconds = 10) {
  const until = Date.now() + seconds * 1000;
  let last;
  while (Date.now() < until) {
    try {
      return await call("ping", {}, { timeoutMs: 1000 });
    } catch (e) {
      last = e;
      await sleep(100);
    }
  }
  throw last ?? new EngineError("engine_down", "engine did not answer");
}

function restart() {
  const uid = process.getuid();
  execFileSync("/bin/launchctl", ["kickstart", "-k", `gui/${uid}/${LABEL}`], { stdio: "pipe" });
}

function parseTarget(t) {
  if (!t) throw new EngineError("usage", "missing <target>; e.g. display, rect:0,0,800,600, window:1234, app:Chrome");
  if (t.startsWith("{")) return JSON.parse(t);
  const [kind, rest = ""] = t.split(/:(.*)/s);
  if (kind === "display") return rest ? { type: "display", display_id: Number(rest) } : { type: "display" };
  if (kind === "rect") {
    const [x, y, w, h] = rest.split(",").map(Number);
    return { type: "rect", x, y, w, h };
  }
  if (kind === "window") return { type: "window", window_id: Number(rest) };
  if (kind === "app") {
    const [app, title] = rest.split(/\/(.*)/s);
    return { type: "window", app, ...(title ? { title } : {}) };
  }
  throw new EngineError("usage", `can't read target ${t}`);
}

// The engine only takes absolute times; "+90s" style offsets are a CLI nicety.
function absTime(t) {
  const m = /^\+(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(t ?? "");
  if (!m) return /^\d+(\.\d+)?$/.test(t ?? "") ? Number(t) : t;
  const mult = { ms: 1, s: 1000, m: 60000, h: 3600000 }[m[2] ?? "s"];
  return new Date(Date.now() + Number(m[1]) * mult).toISOString();
}

const argv = process.argv.slice(2);
// --session <id> / --new <title> pick the session for `record`.
function takeFlag(name) {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
}
const legacyIdle = argv.includes("--legacy-idle");
if (legacyIdle) argv.splice(argv.indexOf("--legacy-idle"), 1);
const recoverTerminal = argv.includes("--recover-terminal");
if (recoverTerminal) argv.splice(argv.indexOf("--recover-terminal"), 1);
const sessionFlag = takeFlag("--session");
const newFlag = takeFlag("--new");
const [cmd = "status", ...args] = argv;
try {
  switch (cmd) {
    case "status":
      out(await call("status"));
      break;
    case "ping": {
      const t = process.hrtime.bigint();
      const r = await call("ping");
      out({ ...r, round_trip_ms: Number(process.hrtime.bigint() - t) / 1e6 });
      break;
    }
    case "grant":
      out(await call("permission.request", {}, { timeoutMs: 120000 }));
      break;
    case "probe":
      out(await call("capture.probe"));
      break;
    case "restart":
    case "build": {
      const prepared = await prepareMaintenance(call, { allowLegacyIdle: legacyIdle, allowUnfinishedTerminal: recoverTerminal });
      let issued = false;
      try {
        let bundle;
        if (cmd === "build") {
          const flags = prepared.mode === "fenced" ? ["--maintenance-token", prepared.token] : ["--legacy-idle"];
          bundle = execFileSync("/usr/bin/python3", [path.join(HERE, "build.py"), ...flags], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
        }
        await validateMaintenance(call, prepared);
        issued = true; // Observe an uncertain reply; never duplicate-submit.
        if (prepared.mode === "fenced") {
          try { await call("maintenance.restart", { token: prepared.token }, { timeoutMs: 5000 }); }
          catch (e) { if (!["engine_down", "timeout", "socket_error"].includes(e.code)) { issued = false; throw e; } }
        } else { restart(); }
        const until = Date.now() + 20000;
        let loaded;
        while (Date.now() < until) {
          try { const s = await call("status", {}, { timeoutMs: 1000 }); if (s.engine?.pid !== prepared.pid && s.maintenance?.loading !== true) { loaded = s; break; } }
          catch {}
          await sleep(200);
        }
        if (loaded && cmd === "build") {
          const expected = readFileSync(path.resolve(HERE, "../../data/record-screen/source.sha256"), "utf8").trim().slice(0, 12);
          if (loaded.engine?.build !== expected) throw new EngineError("build_mismatch", "New PID loaded a different build; inspect before any further action");
        }
        if (!loaded) throw new EngineError("maintenance_unresolved", "Restart was issued once; no new PID was confirmed. Inspect the existing process before any further action");
        out({ ...(bundle ? { bundle } : {}), ...loaded, maintenance_mode: prepared.mode });
      } finally {
        if (!issued) await releaseMaintenance(call, prepared).catch(() => {});
      }
      break;
    }
    case "wait":
      out(await waitUp(Number(args[0] ?? 10)));
      break;
    case "logs": {
      const n = Number(args[0] ?? 20);
      const lines = readFileSync(enginePaths().log, "utf8").trimEnd().split("\n").slice(-n);
      process.stdout.write(lines.join("\n") + "\n");
      break;
    }
    case "windows":
      {
        const query=validateWindowQuery(args[0]?.startsWith('{') ? JSON.parse(args[0]) : { ...(args[0] ? { app: args[0] } : {}), ...(args[1] ? { title: args[1] } : {}) });
        if(Object.hasOwn(query,'include_transients'))requireTransientInventory(await call('status'),query);
        out(await call("windows.list",query));
      }
      break;
    case "production-plan": {
      const request = validateProductionRequest(JSON.parse(args[0] ?? "{}"));
      const status = await call("status");
      const windows = request.target.type === "window" ? await call("windows.list", { limit: 256, ...(status.capabilities?.transient_window_inventory === 1 ? {include_transients:true} : {}) }) : { windows: [], total: 0 };
      out(planProduction(request, status, windows));
      break;
    }
    case "input-query": {
      const request=validateInputQuery(JSON.parse(args[0]??"{}"));
      const status=await call("status");
      if(status.capabilities?.source_journal!==1)throw new EngineError("unsupported_source_journal","Retained input query requires source_journal v1; no capture was started.");
      const source=await call("record.source",{recording_id:request.recording_id});
      out(await queryRecordingInput(source,request));
      break;
    }
    case "verify":
      out(await call("frame.verify", { target: parseTarget(args[0]), ...(args[1] ? { max_width: Number(args[1]) } : {}) }));
      break;
    case "outline":
      out(await call("overlay.show", { target: parseTarget(args[0]), ...(args[1] ? { label: args[1] } : {}), ...(args[2] ? { seconds: Number(args[2]) } : {}) }));
      break;
    case "outline-off":
      out(await call("overlay.hide"));
      break;
    case "record":
      out(await call("record.schedule", {
        target: parseTarget(args[0]), start_at: absTime(args[1]), end_at: absTime(args[2]),
        ...(args[3] ? { preset: args[3] } : {}), ...(args[4] ? { label: args[4] } : {}),
        ...(sessionFlag ? { session_id: sessionFlag } : {}), ...(newFlag ? { session: { title: newFlag } } : {}),
      }));
      break;
    case "recordings":
      out(await call("record.list", args[0] ? { state: args[0] } : {}));
      break;
    case "recording":
      out(await call("record.get", { recording_id: args[0] }));
      break;
    case "action-begin":
      out(await call("action.begin",JSON.parse(args[0] ?? "{}")));
      break;
    case "action-end":
      out(await call("action.end",JSON.parse(args[0] ?? "{}")));
      break;
    case "action-scopes":
      out(await call("action.list",{session_id:args[0],...(args[1] ? {caller:args[1]} : {})}));
      break;
    case "record-source":
      out(await call("record.source", { recording_id: args[0] }));
      break;
    case "frame-map": {
      const request = validateFrameMapRequest(JSON.parse(args[0] ?? "{}"));
      if ((await call("status")).capabilities?.source_journal !== 1) throw new EngineError("unsupported_source_journal", "Frame mapping requires recorder-owned source_journal v1.");
      const source = await call("record.source", { recording_id: request.recording_id });
      out(await mapRecordingFrames(source, request));
      break;
    }
    case "record-wait": {
      const timeout_s = Number(args[2] ?? 60);
      out(await call("record.wait", { recording_id: args[0], until: args[1] ?? "done", timeout_s }, { timeoutMs: (timeout_s + 5) * 1000 }));
      break;
    }
    case "stop":
      out(await call("record.stop", { recording_id: args[0] }));
      break;
    case "cancel":
      out(await call("record.cancel", { recording_id: args[0] }));
      break;
    case "sessions": {
      const mine = args.includes("--mine");
      const query = args.filter((a) => a !== "--mine").join(" ");
      const agent = callerContext().agent_session_id;
      out(await call("session.search", { ...(query ? { query } : {}), ...(mine && agent ? { agent_session_id: agent } : {}) }));
      break;
    }
    case "session":
      out(await call("session.get", { session_id: args[0] }));
      break;
    case "session-new":
      out(await call("session.create", { title: args[0], ...(args[1] ? { purpose: args[1] } : {}) }));
      break;
    case "note":
      out(await call("session.note", { session_id: args[0], text: args.slice(1).join(" ") }));
      break;
    case "mark":
      out(await call("record.mark", { label: args[0], ...(args[1]?.startsWith("ses_") ? { session_id: args[1] } : { recording_id: args[1] }) }));
      break;
    case "close":
      out(await call("session.close", { session_id: args[0] }));
      break;
    case "install": {
      const r = install({ dry: args.includes("--dry-run") });
      out(r);
      if (Object.values(r).some((v) => v.startsWith("FAILED"))) process.exit(1);
      break;
    }
    case "call":
      out(await call(args[0], args[1] ? JSON.parse(args[1]) : {}));
      break;
    default:
      throw new EngineError("usage", `unknown command ${cmd}; see the header of ${path.join(HERE, "cli.mjs")}`);
  }
} catch (e) {
  out({ error: { code: e.code ?? "error", message: e.message } });
  process.exit(1);
}
