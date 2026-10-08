#!/usr/bin/env node
// record-screen MCP server: the agent-facing tools over the record-screend
// engine (see README.md). Stateless: every call goes to the engine's socket.
import { readFileSync } from "node:fs";

import { serveMcp } from "../lib/node/mcp-stdio.mjs";
import { callerContext } from "./lib/caller.mjs";
import { EngineClient, EngineError } from "./lib/client.mjs";
import { hasCaptureOptions, requireCaptureOptions } from "./lib/capture-options.mjs";

const log = (...args) => console.error("[record-screen]", ...args);
const VERSION = "0.6.0";

// ---------------------------------------------------------------- engine link

let client = new EngineClient();

/** Calls the engine; rides out an engine restart (it self-restarts after an
 *  encoder stall and comes back in ~5 s). */
async function engine(method, params = {}, timeoutMs = 20000) {
  const deadline = Date.now() + 12000;
  for (;;) {
    try {
      if (hasCaptureOptions(params.target)) {
        requireCaptureOptions(await client.call("status", {}, { timeoutMs }));
      }
      if (method === "record.source" && (await client.call("status", {}, { timeoutMs })).capabilities?.source_journal !== 1) {
        throw new EngineError("unsupported_source_journal", "The loaded engine does not advertise source_journal v1. Legacy footage has no recorder-owned source packet.");
      }
      return await client.call(method, params, { timeoutMs });
    } catch (err) {
      if (err.code !== "engine_down" || Date.now() > deadline) throw err;
      client = new EngineClient();
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

// ------------------------------------------------------------------- schemas

const TARGET = {
  type: "object",
  description:
    "What to capture. Global points, origin top-left of the main display, y down (same as Hammerspoon hs.window:frame()). " +
    '{"type":"display","display_id"?} (omit id = main) | {"type":"rect","x","y","w","h"} | ' +
    '{"type":"window","window_id"} or {"type":"window","app":"bundle id or name","title"?:"words"}. ' +
    "Window targets keep recording when covered or on another Space, not when the app is hidden or the window minimized.",
  properties: {
    type: { type: "string", enum: ["display", "rect", "window"] },
    display_id: { type: "number" }, x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" },
    window_id: { type: "number" }, app: { type: "string" }, title: { type: "string" },
    include_child_windows: { type: "boolean", description: "Explicit child-window inclusion. Omit to retain the SDK default. Qualify menu pixels for the app/mode before relying on it." },
    exclude_apps: { type: "array", maxItems: 8, items: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9.-]*$", maxLength: 256 }, description: "Exact bundle identifiers to exclude from display/rect capture. Missing apps fail explicitly; unsupported on isolated window targets. No implicit helper exclusion." },
  },
  required: ["type"],
};
const SESSION_ID = { type: "string", description: "Session id (ses_…). Find lost ids with session_find." };
const NEW_SESSION = {
  type: "object",
  description: "Open a new session in the same call instead of passing session_id.",
  properties: { title: { type: "string" }, purpose: { type: "string" }, tags: { type: "array", items: { type: "string" } } },
  required: ["title"],
};
const TIME = (what) => ({
  type: "string",
  description: `${what}: absolute ISO 8601 time, e.g. 2026-10-05T20:15:00Z. Compute it from clock.wall in any reply (the engine's time).`,
});

// --------------------------------------------------------------------- tools

const text = (v) => (typeof v === "string" ? v : JSON.stringify(v));

// Engine messages name engine methods; agents see tool names.
const TOOL_NAMES = [
  [/session\.search/g, "session_find"], [/session\.reopen/g, "session_update (state: open)"], [/session\.create/g, "session_open"],
  [/record\.list/g, "recordings"], [/windows\.list/g, "windows"], [/record\.schedule/g, "record_schedule"], [/frame\.verify/g, "frame_check"],
  [/`record-screen grant`/g, "`record-screen grant` in a terminal"], [/`record-screen restart`/g, "`record-screen restart` in a terminal"],
];
const toolish = (m) => TOOL_NAMES.reduce((s, [re, to]) => s.replace(re, to), m);
const ok = (v) => ({ content: [{ type: "text", text: text(v) }], isError: false });

const tools = [
  {
    name: "status",
    description: "Engine health, Screen Recording permission, displays (ids, frames, scale), engine clock, warm lanes and outlines. Start here if anything fails.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    run: async () => ok(await engine("status")),
  },
  {
    name: "windows",
    description: "List windows front to back (on-screen first) with window_id, app, bundle id, title, frame and on_screen. Use it to build window targets.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: { app: { type: "string", description: "bundle id or name (substring)" }, title: { type: "string" }, on_screen_only: { type: "boolean" }, limit: { type: "number" } },
    },
    annotations: { readOnlyHint: true },
    run: async (a) => ok(await engine("windows.list", a)),
  },
  {
    name: "frame_check",
    description:
      "Capture the target right now and return the image, plus what was resolved (frame, scale, pixels), checks (looks_blank, warnings) and timing. " +
      "Repeat checks of the same target are 2–12 ms (warm lane); checks of an area being recorded read the recording itself (source: tap). " +
      "Safe to call while recordings run and from many agents at once. Pass session_id to keep the image in that session.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: {
        target: TARGET, session_id: SESSION_ID,
        max_width: { type: "number", description: "Image width cap in pixels (default 1024; 0 = native)" },
        format: { type: "string", enum: ["jpeg", "png"] },
      },
      required: ["target"],
    },
    annotations: { readOnlyHint: true },
    run: async (a) => {
      const r = await engine("frame.verify", { max_width: 1024, quality: 0.75, ...a });
      const img = readFileSync(r.image.path).toString("base64");
      return {
        content: [{ type: "image", data: img, mimeType: r.image.format === "png" ? "image/png" : "image/jpeg" }, { type: "text", text: text(r) }],
        isError: false,
      };
    },
  },
  {
    name: "frame_outline",
    description:
      "Draw a frame outline (corner brackets, optional label) around a target so a human can see it. Never in any capture, never takes focus or clicks. " +
      "hide: true removes outlines (one overlay_id, a session's, or all).",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: {
        target: TARGET, label: { type: "string" }, seconds: { type: "number", description: "default 8; 0 = until hidden" },
        session_id: SESSION_ID, overlay_id: { type: "string" }, hide: { type: "boolean" },
      },
    },
    run: async (a) => {
      if (a.hide) return ok(await engine("overlay.hide", { overlay_id: a.overlay_id, session_id: a.session_id }));
      if (!a.target) throw new EngineError("bad_params", "target is required unless hide is true");
      return ok(await engine("overlay.show", a));
    },
  },
  {
    name: "session_open",
    description: "Open a session: the folder that bundles this work's recordings, frame checks, notes and marks. Keep the returned session_id.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: { title: { type: "string" }, purpose: { type: "string" }, tags: { type: "array", items: { type: "string" } } },
      required: ["title"],
    },
    run: async (a, ctx) => ok(await engine("session.create", { ...a, caller: caller(ctx) })),
  },
  {
    name: "session_find",
    description:
      "Find sessions (e.g. a lost session_id). All query words must match title, purpose, tags, notes, recording labels, marks, or the directory/repo/branch it was made from. " +
      "Results are clues for you to judge: matched fields, last_note, recent_marks, recording_now, last_image, made_by (claimed by the client that opened it, not verified). " +
      "mine: true filters on this agent's claimed session id. Newest activity first.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: {
        query: { type: "string" }, mine: { type: "boolean" }, cwd: { type: "string", description: "prefix" }, repo: { type: "string" }, branch: { type: "string" },
        tag: { type: "string" }, state: { type: "string", enum: ["open", "closed"] }, since: { type: "string", description: "ISO 8601" }, limit: { type: "number" },
      },
    },
    annotations: { readOnlyHint: true },
    run: async ({ mine, ...a }, ctx) => {
      const agent = caller(ctx).agent_session_id;
      if (mine && !agent) throw new EngineError("no_agent_id", "this client exposes no session id (CLAUDE_CODE_SESSION_ID / CODEX_THREAD_ID); search by query, cwd or repo instead");
      return ok(await engine("session.search", { ...a, ...(mine ? { agent_session_id: agent } : {}) }));
    },
  },
  {
    name: "session_show",
    description: "One session in full: title, purpose, made_by, counts, its recordings (state, label, video path, marks) and recent events.",
    inputSchema: { type: "object", additionalProperties: false, properties: { session_id: SESSION_ID, events: { type: "number" } }, required: ["session_id"] },
    annotations: { readOnlyHint: true },
    run: async (a) => ok(await engine("session.get", a)),
  },
  {
    name: "session_note",
    description: "Leave a breadcrumb in a session's log (what you're about to record, what you saw). session_find searches notes.",
    inputSchema: { type: "object", additionalProperties: false, properties: { session_id: SESSION_ID, text: { type: "string" } }, required: ["session_id", "text"] },
    run: async (a) => ok(await engine("session.note", a)),
  },
  {
    name: "session_update",
    description: "Change a session's title, purpose or tags, or close/reopen it (a closed session takes no new recordings).",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: { session_id: SESSION_ID, title: { type: "string" }, purpose: { type: "string" }, tags: { type: "array", items: { type: "string" } }, state: { type: "string", enum: ["open", "closed"] } },
      required: ["session_id"],
    },
    run: async ({ state, ...a }) => {
      let r;
      if (a.title !== undefined || a.purpose !== undefined || a.tags !== undefined) r = await engine("session.update", a);
      if (state) r = await engine(state === "closed" ? "session.close" : "session.reopen", { session_id: a.session_id });
      return ok(r ?? (await engine("session.get", { session_id: a.session_id, events: 0 })));
    },
  },
  {
    name: "record_schedule",
    description:
      "Schedule a recording. start_at and end_at are both required and absolute, so recordings can be queued for any future window (up to 16 overlapping, 3 h each, 7 days ahead). " +
      "The engine arms 1 s early, so the video starts exactly at start_at showing the screen as it was then, and ends exactly at end_at. " +
      "Needs session_id or session {title}. Presets: evidence (default, 1 px per point, 30 fps), demo (Retina, 60 fps), pr-clip (1280 wide, 30 fps). " +
      "Then record_wait. Pass idempotency_key to make retries safe.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: {
        target: TARGET, start_at: TIME("start_at"), end_at: TIME("end_at"),
        session_id: SESSION_ID, session: NEW_SESSION, label: { type: "string" },
        preset: { type: "string", enum: ["evidence", "demo", "pr-clip"] }, fps: { type: "number" }, codec: { type: "string", enum: ["h264", "hevc"] },
        max_width: { type: "number", description: "0 = native pixels" }, show_cursor: { type: "boolean" }, bitrate_mbps: { type: "number" },
        if_late: { type: "string", enum: ["start", "skip"], description: "if the engine arms >2 s late: record the rest (default) or skip" },
        idempotency_key: { type: "string" },
      },
      required: ["target", "start_at", "end_at"],
    },
    run: async (a, ctx) => ok(await engine("record.schedule", { ...a, caller: caller(ctx) })),
  },
  {
    name: "record_wait",
    description: "Block until a recording starts (until: recording) or finishes (until: done, default). Returns its manifest: state, video path, frames, marks, events, error. timed_out says if it gave up.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: { recording_id: { type: "string" }, until: { type: "string", enum: ["recording", "done"] }, timeout_s: { type: "number", description: "default 120, max 3600" } },
      required: ["recording_id"],
    },
    annotations: { readOnlyHint: true },
    run: async ({ recording_id, until = "done", timeout_s = 120 }, ctx) => {
      const deadline = Date.now() + Math.min(timeout_s, 3600) * 1000;
      for (;;) {
        // Wait in 15 s slices with progress notifications, so clients with
        // short tool timeouts stay alive.
        const slice = Math.max(1, Math.min(15, (deadline - Date.now()) / 1000));
        const r = await engine("record.wait", { recording_id, until, timeout_s: slice }, (slice + 10) * 1000);
        if (!r.timed_out || Date.now() >= deadline) return ok(r);
        ctx.progress(`${recording_id}: ${r.state}`);
      }
    },
  },
  {
    name: "record_stop",
    description: "Stop a recording now and keep the file (manual override), or with discard: true cancel it and delete the file. Works on scheduled ones too (they never start).",
    inputSchema: { type: "object", additionalProperties: false, properties: { recording_id: { type: "string" }, discard: { type: "boolean" } }, required: ["recording_id"] },
    annotations: { destructiveHint: true },
    run: async ({ recording_id, discard }) => ok(await engine(discard ? "record.cancel" : "record.stop", { recording_id })),
  },
  {
    name: "record_reschedule",
    description: "Move a scheduled recording's start_at and/or end_at, or a running recording's end_at (extend or shorten).",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: { recording_id: { type: "string" }, start_at: TIME("start_at"), end_at: TIME("end_at") },
      required: ["recording_id"],
    },
    run: async (a) => ok(await engine("record.reschedule", a)),
  },
  {
    name: "recordings",
    description: "With recording_id: that recording's full manifest. Otherwise list recordings newest first, filtered by session_id, state, or active (not finished).",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: { recording_id: { type: "string" }, session_id: SESSION_ID, state: { type: "string" }, active: { type: "boolean" }, limit: { type: "number" } },
    },
    annotations: { readOnlyHint: true },
    run: async ({ recording_id, ...a }) => ok(await engine(recording_id ? "record.get" : "record.list", recording_id ? { recording_id } : a)),
  },
  {
    name: "recording_source",
    description: "Get a recording's local source journal descriptor and completeness/gap diagnostics. The JSONL packet maps exact host-clock nanoseconds to video-relative time, source frames, geometry segments, encoded/held frames and declared marks. Returns paths, never bulk rows or pixels. Inspect telemetry completeness and transform qualification before composing; interrupted frame counters may be checkpoints. Requires engine source_journal v1.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: { recording_id: { type: "string" } }, required: ["recording_id"],
    },
    annotations: { readOnlyHint: true },
    run: async (a) => ok(await engine("record.source", a)),
  },
  {
    name: "recording_review",
    description:
      "Review a finished recording without watching it: returns the contact sheet image (start, marks, scene changes, end; each tile labelled with its time) plus the keyframe list, " +
      "activity per second (0 = nothing changed) and duration. keyframe_images: N also returns the first N keyframes as images. Tiny changes (a single small glyph) can fall between samples; use recording_frames to look at exact times.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: { recording_id: { type: "string" }, keyframe_images: { type: "number", description: "also return up to this many keyframes as images (default 0, max 12)" } },
      required: ["recording_id"],
    },
    annotations: { readOnlyHint: true },
    run: async ({ recording_id, keyframe_images = 0 }) => {
      const review = await engine("record.review", { recording_id }, 60000);
      const manifest = await engine("record.get", { recording_id });
      const content = [];
      try { content.push(imageContent(review.contact_sheet)); } catch {}
      for (const k of (review.keyframes ?? []).slice(0, Math.min(12, keyframe_images))) content.push(imageContent(k.path));
      content.push({ type: "text", text: text({ recording_id, ...review, activity_per_s: manifest.activity_per_s, marks: manifest.marks, video: manifest.video }) });
      return { content, isError: false };
    },
  },
  {
    name: "recording_frames",
    description: "Frames of a finished recording at exact offsets (seconds from its start), returned as images. frame_t_s says when the frame shown actually began (recordings only add frames when the screen changes).",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: { recording_id: { type: "string" }, at_s: { type: "array", items: { type: "number" }, description: "1–12 offsets in seconds" }, max_width: { type: "number", description: "default 1024" } },
      required: ["recording_id", "at_s"],
    },
    annotations: { readOnlyHint: true },
    run: async ({ recording_id, at_s, max_width = 1024 }) => {
      if (!Array.isArray(at_s) || !at_s.length || at_s.length > 12) throw new EngineError("bad_params", "at_s must list 1–12 offsets");
      const r = await engine("record.frames", { recording_id, at_s, max_width }, 60000);
      return { content: [...r.frames.map((f) => imageContent(f.path)), { type: "text", text: text(r) }], isError: false };
    },
  },
  {
    name: "record_export",
    description:
      "Cut a finished recording into an mp4 (hardware-encoded, 30 fps) or a GIF (12 fps, palette-optimised, max 60 s), by seconds (from_s/to_s) or by mark labels (from_mark/to_mark). " +
      "Cuts are frame-exact, including over stretches where the screen didn't change. Returns the file path and size; files land in the recording's exports/ folder.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: {
        recording_id: { type: "string" }, format: { type: "string", enum: ["mp4", "gif"] },
        from_s: { type: "number" }, to_s: { type: "number" }, from_mark: { type: "string" }, to_mark: { type: "string" },
        max_width: { type: "number" }, fps: { type: "number" }, name: { type: "string", description: "file name (default trim-<from>-<to>.mp4 / clip-<from>-<to>.gif)" },
      },
      required: ["recording_id"],
    },
    run: async (a) => ok(await engine("record.export", a, 600000)),
  },
  {
    name: "mark",
    description: "Mark this moment in running recordings (one by recording_id, or every running one in session_id) for chapters and trims; returns each video offset t_s. Without a running recording the mark still lands in the session log.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: { label: { type: "string" }, recording_id: { type: "string" }, session_id: SESSION_ID, kind: { type: "string" } },
      required: ["label"],
    },
    run: async (a) => ok(await engine("record.mark", a)),
  },
];

function imageContent(path) {
  return { type: "image", data: readFileSync(path).toString("base64"), mimeType: path.endsWith(".png") ? "image/png" : "image/jpeg" };
}

/** Who is calling: stored on new sessions as unverified clues for later search. */
function caller(ctx) {
  const c = { ...callerContext(process.cwd()) };
  if (ctx?.client?.name) c.client = `${ctx.client.name}${ctx.client.version ? `@${ctx.client.version}` : ""}`;
  return c;
}

const instructions =
  "record-screen records this Mac's screen through an always-on engine. Typical flow: session_open (or session_find to recover a lost session_id) → " +
  "windows / frame_check to aim (frame_check returns the image; frame_outline shows the frame to the human) → record_schedule with absolute start_at and end_at " +
  "(compute from clock.wall, which every reply carries) → mark during recording for chapters → record_wait → recording_review (contact sheet image + keyframes) " +
  "→ recording_frames for exact moments → record_export for a trimmed mp4 or GIF. " +
  "Sessions are always explicit: the engine never guesses which session is yours. Many agents may use it at once; the engine never takes focus.";

await serveMcp({
  name: "record-screen",
  version: VERSION,
  instructions,
  tools: tools.map(({ run, ...t }) => ({
    ...t,
    handler: async (args, ctx) => {
      try {
        return await run(args ?? {}, ctx);
      } catch (err) {
        if (!(err instanceof EngineError)) log(err.stack);
        return { content: [{ type: "text", text: `${t.name} failed [${err.code ?? "error"}]: ${toolish(err.message)}` }], isError: true };
      }
    },
  })),
  log,
});
process.exit(0);
