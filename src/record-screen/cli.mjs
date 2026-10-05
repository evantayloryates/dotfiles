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
//   record-screen call <method> [json-params]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { call, enginePaths, EngineError, LABEL } from "./lib/client.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
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
