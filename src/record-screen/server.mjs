#!/usr/bin/env node
// record-screen MCP server: the agent-facing tools over the record-screend
// engine (see README.md), plus bounded local media/input readers. Adapter-owned
// query/probe admission is separate from native engine capability/health.
import { readFileSync } from "node:fs";

import { serveMcp } from "../lib/node/mcp-stdio.mjs";
import { callerContext } from "./lib/caller.mjs";
import { EngineClient, EngineError } from "./lib/client.mjs";
import { hasCaptureOptions, requireCaptureOptions } from "./lib/capture-options.mjs";
import { mapDerivativeTimes } from "./lib/derivative-source.mjs";
import { mapRecordingFrames, validateFrameMapRequest, frameMapSchema, frameMapHealth } from "./lib/frame-map.mjs";
import { mapRecordingPair, validatePairedMapRequest, pairedMapSchema } from "./lib/paired-map.mjs";
import { windowQuerySchema, validateWindowQuery, requireTransientInventory } from "./lib/window-query.mjs";
import { planProduction, productionPlanSchema, validateProductionRequest } from "./lib/production-plan.mjs";
import {queryRecordingInput,validateInputQuery,inputQuerySchema,inputQueryHealth} from "./lib/input-query.mjs";

const log = (...args) => console.error("[record-screen]", ...args);
const VERSION = "0.16.0";

// ---------------------------------------------------------------- engine link

let client = new EngineClient();

// Only readbacks reconnect automatically. A disconnect can arrive after a
// mutation was accepted; retrying session creation, scheduling or marks can
// duplicate work. Recover their owned IDs/state before an explicit new request.
const RECONNECT_READS = new Set(['ping', 'status', 'windows.list', 'session.get',
  'session.search', 'record.get', 'record.list', 'record.source', 'record.wait',
  'record.export_info']);
/** Readbacks can ride out an engine restart; mutations are never replayed. */
async function engine(method, params = {}, timeoutMs = 20000) {
  const deadline = Date.now() + 12000;
  for (;;) {
    try {
      if (method === "windows.list") {
        validateWindowQuery(params);
        if (Object.hasOwn(params,"include_transients")) requireTransientInventory(await client.call("status",{}, {timeoutMs}),params);
      }
      if (hasCaptureOptions(params.target)) {
        const status=await client.call("status", {}, { timeoutMs });
        requireCaptureOptions(status, params.target);
        if (method === "record.schedule" && params.target.exclude_apps?.length && status.capabilities?.exclusion_identity !== 1) {
          throw new EngineError("unsupported_exclusion_identity", "The loaded engine does not advertise exclusion_identity v1. A recording with helper exclusions requires process-lifetime interruption and explicit quality uncertainty.");
        }
        if (method === "frame.verify" && params.target.exclude_apps?.length && status.capabilities?.preview_exclusion_identity !== 1) {
          throw new EngineError("unsupported_preview_exclusion_identity", "The loaded engine does not advertise preview_exclusion_identity v1. Excluded previews require stale-lane retirement and delivery-time identity validation.");
        }
      }
      if (method === "record.source" && (await client.call("status", {}, { timeoutMs })).capabilities?.source_journal !== 1) {
        throw new EngineError("unsupported_source_journal", "The loaded engine does not advertise source_journal v1. Legacy footage has no recorder-owned source packet.");
      }
      if (["record.export", "record.export_info"].includes(method) && (await client.call("status", {}, { timeoutMs })).capabilities?.derivative_source !== 1) {
        throw new EngineError("unsupported_derivative_source", "The loaded engine does not advertise derivative_source v1. Preview effort controls and mapped exports cannot be silently ignored.");
      }
      if (method.startsWith("action.")) {
        const capabilities = (await client.call("status", {}, { timeoutMs })).capabilities;
        if (capabilities?.action_scopes !== 1) throw new EngineError("unsupported_action_scopes", "The loaded engine does not advertise action_scopes v1. No action was dispatched.");
        if (method === "action.begin" && params.target_resolution === "declared" && capabilities?.declared_action_targets !== 1) {
          throw new EngineError("unsupported_declared_action_targets", "Declared targets require declared_action_targets v1. No action was dispatched.");
        }
      }
      if (params.input !== undefined && (await client.call("status", {}, { timeoutMs })).capabilities?.input_timeline !== 1) {
        throw new EngineError("unsupported_input_timeline", "The loaded engine does not advertise input_timeline v1. Explicit input settings cannot be silently ignored.");
      }
      return await client.call(method, params, { timeoutMs });
    } catch (err) {
      if (!RECONNECT_READS.has(method) || err.code !== "engine_down" || Date.now() > deadline) throw err;
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
    exclude_apps: { type: "array", maxItems: 8, items: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9.-]*$", maxLength: 256 }, description: "Exact bundles to exclude on display/rect targets. Missing apps fail; unsupported on isolated windows. Recordings interrupt and preserve partial media if an observed process identity changes. Preview lanes retire and reject stale in-flight images; a new request resolves fresh identities. Observation can lag and the first affected frame stays unknown. No implicit exclusions." },
    include_apps: { type: "array", minItems: 1, maxItems: 1, items: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9.-]*$", maxLength: 256 }, description: "Optional app-filtered display/rect source: one exact bundle with one current shareable process. Cannot combine with exclude_apps or window target. Fixed display crop does not follow windows or expand overflow. Source keys include resolved PID. Recording interrupts and previews retire on observed identity change; no automatic replacement. Same-app user actions/windows remain possible. Hidden/minimized/off-Space drawing and menus require actual pixel qualification." },
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
    name: "production_plan",
    description: "Read-only capture planning: explicit background/cooperative/reserved expectations, caller-reported production interval, cursor-layer limits, runtime obstacles, measured point/Retina and window/app/display profiles, reference-scene storage scenarios and recovery choices. window_app_display needs an exact window plus explicit backup_rect/backup_max_width; returns candidate per-source targets/settings, never schedules them or follows movement. Scenarios are not predictions, disk reservations or capacity. Starts no capture, drives no UI, locks no input and grants no authorization. Actual source/provider readiness remains a separate check.",
    inputSchema: productionPlanSchema,
    annotations: { readOnlyHint: true },
    run: async a => {
      const request = validateProductionRequest(a);
      const status = await engine("status");
      const windows = request.target.type === "window" ? await engine("windows.list", { limit: 256, ...(status.capabilities?.transient_window_inventory === 1 ? {include_transients:true} : {}) }) : { windows: [], total: 0 };
      return ok(planProduction(request, status, windows));
    },
  },
  {
    name:"action_begin",
    description:"Declare a bounded contextual action block before a native or browser operation. Recorder stamps exact CLOCK_UPTIME_RAW time and by default resolves current bundle/PID/window identity. For pre-launch intent, target_resolution=declared accepts bundle only and never attributes passive input or automatically binds a PID. Does not drive the UI, lock input, or prove exclusive agent ownership. Keep returned token; native CUA needs explicit bracketing. On uncertain response recover with action_scopes before retrying.",
    inputSchema:{type:"object",additionalProperties:false,properties:{session_id:SESSION_ID,
      caller:{type:"string",description:"Stable caller identifier; required again at action_end."},provider:{type:"string"},action_id:{type:"string"},intent:{type:"string",maxLength:3000},
      target_resolution:{type:"string",enum:["observed","declared"],description:"Default observed. Declared is pre-launch semantic intent only; target must contain bundle_id only."},
      target:{type:"object",additionalProperties:false,properties:{bundle_id:{type:"string"},pid:{type:"integer",minimum:1,maximum:2147483647},window_id:{type:"integer",minimum:1,maximum:4294967295}},required:["bundle_id"]},
      context:{type:"object",additionalProperties:false,properties:Object.fromEntries(["purpose","before_state","expected_change","verification_plan"].map(key=>[key,{type:"string",maxLength:1500}]))},
      timeout_s:{type:"number",minimum:1,maximum:120,description:"Default 30. Expiry ends attribution only; it cannot cancel the UI operation."}
    },required:["session_id","caller","provider","action_id","intent","target"]},
    run:async a=>ok(await engine("action.begin",a)),
  },
  {
    name:"action_end",
    description:"Close a declared token with recorder time and caller-reported result. Idempotent after settlement. Unknown end time after engine restart is preserved. Never use a claimed verified result alone as proof that an app action succeeded.",
    inputSchema:{type:"object",additionalProperties:false,properties:{session_id:SESSION_ID,caller:{type:"string"},action_token:{type:"string"},
      result:{type:"string",enum:["dispatched","delivered","verified","failed","interrupted","unknown"]},evidence_refs:{type:"array",maxItems:16,items:{type:"string",description:"Absolute local evidence paths; no pixels or bulk event rows."}}
    },required:["session_id","caller","action_token","result"]},
    run:async a=>ok(await engine("action.end",a)),
  },
  {
    name:"action_scopes",
    description:"Recover declared action tokens within an existing recording session, optionally filtered by caller. Up to 100 contextual records; newest 4096 disk files inspected after restart. Reports truncation/read errors. A restarted active block has unknown end time, not a made-up timestamp.",
    inputSchema:{type:"object",additionalProperties:false,properties:{session_id:SESSION_ID,caller:{type:"string"}},required:["session_id"]},annotations:{readOnlyHint:true},
    run:async a=>ok(await engine("action.list",a)),
  },
  {
    name: "status",
    description: "Engine health, Screen Recording permission, displays (ids, frames, scale), engine clock, warm lanes and outlines. Start here if anything fails.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    run: async () => ok({ ...await engine("status"), mcp_adapter: {
      version: VERSION, declared_target_context: 1, replay_policy: 1, production_planning: 1, production_storage_guidance: 1, triple_source_planning: 1, source_frame_mapping: 1, source_region_mapping: 1, transient_window_query: 1,
      frame_mapping: frameMapHealth(), paired_source_mapping: 1, paired_interval_coverage_summary: 1, fitted_child_mapping_guard: 1, retained_input_query: 1, retained_action_context: 1, retained_input_health_context: 1,
      input_query: inputQueryHealth(), mutation_replay: "never",
      read_reconnect_budget_ms: 12000,
      qualification: "loaded MCP adapter policy; native CLI/socket status does not describe an MCP process",
    } }),
  },
  {
    name: "windows",
    description: "List windows front to back (on-screen first) with window_id, app, bundle id, title, frame, layer and on_screen. Default normal inventory excludes floating/small/.xpc helpers. Opt into include_transients explicitly only with native transient_window_inventory1; then target a currently verified exact ID. Inventory membership/proximity is not semantic ownership or captured-pixel proof. Bounded limit1–1000; use app/title/on_screen_only to narrow. Read-only; no capture/UI/restart.",
    inputSchema: windowQuerySchema,
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
      const { hide, ...show } = a;
      return ok(await engine("overlay.show", show));
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
      "Schedule a recording with required absolute start_at and end_at. Configured limits: 16 overlapping, 3 h each, 7 days ahead; these are not measured capacity. " +
      "The engine attempts to arm 1 s early. Requested times do not guarantee physical presentation or exact decodable boundaries; inspect the terminal manifest, recording_source and actual recording_frame_map coverage. Held frames retain earlier source content. " +
      "Needs session_id or session {title}. Presets: evidence (default, 1 px per point, 30 fps), demo (Retina, 60 fps), pr-clip (1280 wide, 30 fps). " +
      "Then record_wait. Retain session/recording IDs and an idempotency_key. After a lost reply, read back owned state before an explicit retry; mutations are never automatically replayed.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: {
        target: TARGET, start_at: TIME("start_at"), end_at: TIME("end_at"),
        session_id: SESSION_ID, session: NEW_SESSION, label: { type: "string" },
        preset: { type: "string", enum: ["evidence", "demo", "pr-clip"] }, fps: { type: "number" }, codec: { type: "string", enum: ["h264", "hevc"] },
        max_width: { type: "number", description: "0 = native pixels" }, show_cursor: { type: "boolean" }, bitrate_mbps: { type: "number" },
        if_late: { type: "string", enum: ["start", "skip"], description: "if the engine arms >2 s late: record the rest (default) or skip" },
        idempotency_key: { type: "string" },
        input: { type:"object", additionalProperties:false, properties: {
          enabled:{type:"boolean",description:"Passive scoped telemetry. New capable-engine captures default true; no permission is requested automatically."},
          ambiguous_keys:{type:"string",enum:["none","shortcuts","all"],description:"Extra keyboard candidates during declared action blocks. Default shortcuts; app-delivered keys retained in every mode. All may include human typing in the interval."},
          pointer_in_frame:{type:"boolean",description:"Default true. Retain location candidates when window ownership is unresolved."}
        } },
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
    description: "Get a recording's local source journal descriptor and completeness/gap diagnostics. The JSONL packet maps exact host-clock nanoseconds to video-relative time, source frames, geometry segments, encoded/held frames and declared marks. Newer candidates include observed color tags and clock_continuity; absent legacy fields mean unknown. Input diagnostics summarize accepted gap/listener notifications, not live health or complete delivery; blocked listener lifecycles require deliberate recreation. Clock gaps interrupt the affected take; receipt segments do not calibrate provider timestamps. Returns paths, never bulk rows or pixels. Journal completeness and video_outcome are separate: a closed journal can outlive a failed encoder, and accepted submissions can exceed persisted packets. Failed/interrupted footage needs decoded coverage before recovery; null video_outcome means unmeasured/legacy. Inspect transform qualification before composing. Requires engine source_journal v1.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: { recording_id: { type: "string" } }, required: ["recording_id"],
    },
    annotations: { readOnlyHint: true },
    run: async (a) => ok(await engine("record.source", a)),
  },
  {
    name: "recording_frame_map",
    description: "Resolve actual primary-video frames, exact relative offsets or recorder-domain host nanoseconds to their own source geometry and optional desktop-point/region projections. Up to16 named desktop_regions yield transformed quads, clipped polygons and continuous canvas-area fractions; content_presence stays unverified. Fitted isolated windows with children enabled or unknown and content_scale other than1 withhold projections: transform_available:false, fitted_child_window_origin_unqualified. Raw geometry and timing remain; use independently qualified source geometry. Use this to detect crop clipping, then inspect actual pixels. Host stamps require clock_domain=CLOCK_UPTIME_RAW; external provider calibration is not inferred. Uses a bounded actual mux probe, joins exact timestamps, and keeps held-content clocks separate. Failed/interrupted footage can return known packet mappings with explicit missing matches; journal completeness is not assumed. Frame indices are presentation order; geometry is never borrowed from a newer/current frame. One owned mapping/probe at a time;64 queries/16 points/16 regions,120000 packets,64MiB journal, bounded child lifetime. Read-only: no capture/export/UI or automatic mutation replay. Affine remains candidate outside qualified app/display cases; canvas inclusion does not prove visible content or actor ownership.",
    inputSchema: frameMapSchema,
    annotations: { readOnlyHint: true },
    run: async (a) => {
      const request = validateFrameMapRequest(a);
      const source = await engine("record.source", { recording_id: request.recording_id });
      return ok(await mapRecordingFrames(source, request));
    },
  },
  {
    name: "recording_paired_map",
    description: "Map an exact primary-video-relative interval or recorder-host interval across two terminal recordings without consumer synchronization code. Primary-relative offsets need no clock declaration or epoch arithmetic; host offsets require clock_domain=CLOCK_UPTIME_RAW. Splits actual mux intervals at both sources’ boundaries, preserving dense backup frames across held primary footage, source geometry, exact content age, holes and missing references. Up to256 segments/page; follow only the returned snapshot-bound cursor with the same interval/projections. Same retained recorder-process clock identity is required for qualified alignment; legacy/different-process/unknown clock observations return numeric candidates only with backup availability false. Candidate affine and fitted-child guards still apply; timing/geometry availability does not prove content inclusion, same subject or successful recovery. Optional16 desktop points/regions. include_coverage_summary:true with at least one named region adds exact whole-interval canvas-state durations independent of segment page size; gaps, unmatched source, incomplete journals and unqualified transforms/clocks remain separate. coverage_max_segments1–16384(default4096) bounds summary work; over-budget summary unavailable, no partial claim. Canvas containment does not mean content presence. No pixels, capture, export, composition, UI or mutation replay. Shared single-probe admission, bounded terminal regular-file snapshots; old adapters need a safe next launch or CLI fallback.",
    inputSchema: pairedMapSchema,
    annotations: { readOnlyHint: true },
    run: async a => {
      const request=validatePairedMapRequest(a);
      const primary=await engine("record.source",{recording_id:request.primary_recording_id});
      const backup=await engine("record.source",{recording_id:request.backup_recording_id});
      return ok(await mapRecordingPair(primary,backup,request));
    },
  },
  {
    name: "recording_input",
    description: "Query a terminal recording's capture-retained input in an exact recorder-reception interval, with bounded event-type/action-token filters and snapshot-bound pagination. Default preserves broad retained keys/shortcuts and unassociated candidates. Inclusion reasons, same-app unresolved delivery, contextual action tokens, raw CG generation stamps and unqualified pointer coordinates remain explicit; no human/agent ownership inferred. Optional include_context returns up to64 captured action snapshots, rich caller-authored intent/context and exact scope offsets; updates can remain active/end unknown, declared deadlines and claimed results are not verified UI completion. Context summaries repeat across input pages, bounded truncation explicit; event-type filters leave them visible. Optional include_health_context preserves bounded preceding/in-interval/untimed notifications and all retained protection snapshot counts independent of event filters/pages; observations are not live or continuous state, later notifications are counted without backfilling. Gap diagnostics survive event filters. At most256 events/page,64MiB/250000 source rows,ten-second read budget; one query per adapter. Returns whitelisted metadata and opt-in caller-authored context, never automatic key text/clipboard or the bulk journal. Query cannot recover capture-excluded events or establish actual video/physical delivery coverage. Read-only; no capture, UI, permission request or mutation replay.",
    inputSchema: inputQuerySchema,
    annotations: {readOnlyHint:true},
    run: async a => {
      const request=validateInputQuery(a);
      const source=await engine("record.source",{recording_id:request.recording_id});
      return ok(await queryRecordingInput(source,request));
    },
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
      "Export a finished recording by seconds or mark labels. draft defaults to software/640px/12fps; standard to hardware/native/30fps; full to hardware/native/60fps. GIF defaults to software/960px/12fps and is capped at 60 s. Override width, fps and backend explicitly. " +
      "Cuts use an explicit fps grid, preserve held content and return a recorder-owned source/timing manifest. Names are immutable; exports stay in exports/. One bounded child process at a time; partial attempts are retained on failure. No automatic replay after a disconnect.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: {
        recording_id: { type: "string" }, format: { type: "string", enum: ["mp4", "gif"] },
        from_s: { type: "number" }, to_s: { type: "number" }, from_mark: { type: "string" }, to_mark: { type: "string" },
        max_width: { type: "integer", minimum: 64, maximum: 8192 }, fps: { type: "integer", minimum: 1, maximum: 120, description: "GIF maximum 50; mapping budget 120,000 frames" },
        effort: { type: "string", enum: ["draft", "standard", "full"] }, backend: { type: "string", enum: ["software", "hardware"] },
        name: { type: "string", description: "new file name; omitted names include a unique suffix so draft/full attempts do not overwrite each other" },
      },
      required: ["recording_id"],
    },
    run: async (a) => ok(await engine("record.export", a, 600000)),
  },
  {
    name: "export_time_map",
    description: "Map exact parent-video relative nanoseconds into a saved export's actual media clock. Handles trimmed grid origins and GIF centiseconds inside the service. Outside-clip times are explicit exclusions. This maps timeline position, not physical display latency or event ownership.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: { recording_id: { type: "string" }, name: { type: "string" }, parent_relative_ns: { type: "array", minItems: 1, maxItems: 256, items: { type: "string", pattern: "^-?[0-9]{1,24}$" } } },
      required: ["recording_id", "name", "parent_relative_ns"],
    },
    annotations: { readOnlyHint: true },
    run: async ({ recording_id, name, parent_relative_ns }) => {
      const info = await engine("record.export_info", { recording_id, name });
      return ok(mapDerivativeTimes(info.path, parent_relative_ns, recording_id));
    },
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
  "Before production UI work, use read-only production_plan for explicit mode/alignment expectations and runtime obstacles; reuse existing user consent. " +
  "A plan is not permission or native readiness: verify the actual target and source pixels, then explicitly schedule chosen settings. Input stays available. " +
  "Use recording_frame_map for bounded actual-mux/source geometry and point/region projection; crop clipping is geometric, while content presence needs pixels. Missing references and uncovered times stay explicit. " +
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
