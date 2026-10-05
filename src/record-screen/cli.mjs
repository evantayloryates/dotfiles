#!/usr/bin/env node
// record-screen: command line for the capture engine. Prints JSON.
//
//   record-screen status            engine, permission, clock and displays
//   record-screen ping              socket round trip in ms
//   record-screen grant             ask macOS for Screen Recording (prompts once)
//   record-screen probe             prove ScreenCaptureKit works, with timings
//   record-screen restart           restart the LaunchAgent and wait for it
//   record-screen build             rebuild if sources changed, then restart
//   record-screen wait [seconds]    wait until the engine answers
//   record-screen logs [n]          last n engine log lines (default 20)
//   record-screen windows [app] [title]        list windows (window ids for targets)
//   record-screen verify <target> [max_width]  capture the target, print image path and checks
//   record-screen outline <target> [label] [seconds]   draw the frame outline (0 s = until hidden)
//   record-screen outline-off                  hide all outlines
//   record-screen call <method> [json-params]
//
// <target> shorthand: display | display:<id> | rect:x,y,w,h | window:<id> |
// app:<bundle id or name>[/<title words>] | a JSON object
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { call, enginePaths, EngineError, LABEL } from "./lib/client.mjs";

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

const [cmd = "status", ...args] = process.argv.slice(2);
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
      restart();
      await waitUp();
      out(await call("status"));
      break;
    case "build": {
      const r = execFileSync("/usr/bin/python3", [path.join(HERE, "build.py")], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      restart();
      await waitUp();
      const s = await call("status");
      out({ bundle: r.trim(), build: s.engine.build, permission: s.permission });
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
      out(await call("windows.list", { ...(args[0] ? { app: args[0] } : {}), ...(args[1] ? { title: args[1] } : {}) }));
      break;
    case "verify":
      out(await call("frame.verify", { target: parseTarget(args[0]), ...(args[1] ? { max_width: Number(args[1]) } : {}) }));
      break;
    case "outline":
      out(await call("overlay.show", { target: parseTarget(args[0]), ...(args[1] ? { label: args[1] } : {}), ...(args[2] ? { seconds: Number(args[2]) } : {}) }));
      break;
    case "outline-off":
      out(await call("overlay.hide"));
      break;
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
