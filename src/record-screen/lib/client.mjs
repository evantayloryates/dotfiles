// Client for the record-screend socket: newline-delimited JSON, many requests
// per connection, responses matched by id. Zero dependencies.
import net from "node:net";
import os from "node:os";
import path from "node:path";

export const LABEL = "com.taylor.record-screen";

export function enginePaths() {
  const root = process.env.RECORD_SCREEN_HOME || path.join(os.homedir(), ".record-screen");
  return {
    root,
    socket: path.join(root, "run", "engine.sock"),
    log: path.join(root, "logs", "engine.jsonl"),
  };
}

export class EngineError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const DOWN = "The record-screen engine isn't running. Start it with `record-screen restart`; if that fails, see ~/.record-screen/logs/stderr.log.";

export class EngineClient {
  constructor({ socket = enginePaths().socket } = {}) {
    this.socketPath = socket;
    this.sock = null;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
  }

  connect() {
    if (this.sock) return this.ready;
    this.sock = net.createConnection(this.socketPath);
    this.ready = new Promise((resolve, reject) => {
      this.sock.once("connect", resolve);
      this.sock.once("error", (e) => {
        const down = e.code === "ENOENT" || e.code === "ECONNREFUSED";
        reject(new EngineError(down ? "engine_down" : "socket_error", down ? DOWN : e.message));
      });
    });
    this.sock.setEncoding("utf8");
    this.sock.on("data", (chunk) => this.#onData(chunk));
    this.sock.on("close", () => this.#failAll(new EngineError("engine_down", DOWN)));
    this.sock.on("error", () => {});
    return this.ready;
  }

  async call(method, params = {}, { timeoutMs = 15000 } = {}) {
    await this.connect();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new EngineError("timeout", `${method} got no reply within ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.sock.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }

  close() {
    this.sock?.end();
    this.sock = null;
  }

  #onData(chunk) {
    this.buffer += chunk;
    let nl;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const p = this.pending.get(msg.id);
      if (!p) continue;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new EngineError(msg.error.code, msg.error.message));
      else p.resolve(msg.result);
    }
  }

  #failAll(err) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
    this.sock = null;
  }
}

/** One-shot call: connect, call, close. */
export async function call(method, params = {}, opts = {}) {
  const c = new EngineClient(opts);
  try {
    return await c.call(method, params, opts);
  } finally {
    c.close();
  }
}
