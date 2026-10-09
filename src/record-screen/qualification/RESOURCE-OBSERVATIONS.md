# Passive GPU and real-app resource observations

Use the existing process/pressure collector alongside optional `sample-gpu.py`.
The GPU collector is passive: no root/authentication, UI action, input lock,
capture, native restart or guard. Use a fresh absolute private directory:

```sh
python3 /Users/taylor/src/github/dotfiles/src/record-screen/qualification/sample-gpu.py --seconds 120 --interval-ms 1000 --output /absolute/fresh/private-directory
```

Arguments bound duration1–600s, interval1–10s. Each fixed AGX `ioreg` query has a
2s deadline and1MiB raw-output budget; owned child is reaped even on failure.
At most four accelerator records retain explicit truncation. Only three reported
utilization fields and eight counter fields survive. Missing/invalid values are
null, not idle zero; integers are exact decimal strings. Counter units, rate,
reset and percentage averaging semantics are unqualified. XML/plist surface or
other properties are not copied to the result. Output directory0700/files0600.

`samples.jsonl` preserves observer monotonic query bounds and query-end wall time.
Neither is calibrated to recorderCLOCK_UPTIME_RAW. Wall matching to requested
capture times is approximate. `result.json` terminal state includes interruption,
unavailable counts and separate CPU seconds for observer and reaped ioreg children.
It excludes kernel/device and shared WindowServer work. Earlier result files
without CPU accounting keep child cost unknown; do not estimate from a later
smoke. SIGTERM/interrupt settles the owned child and terminal summary.

Stage48 actual TextEdit1.20/build415/25F80 paired90s native2x requested60fps scene:
3013 isolated+2869 display exact source/mux packets.116 AGX samples over120s;
87 query-end wall samples inside requested take, all available. Reported Device/
Renderer min0/median28/max59; Tiler0/14/44. Querymedian39.13ms/max44.50ms.
100 process samples over99.999s include aftertake: recorder7.93CPU seconds,
RSS44,528..145,616KiB; TextEdit0.83s, shared WindowServer36.5s. All pressure
observations warning, no guard event. ParentGPU0.63CPU seconds excludes children.
Separate new2s accounting smoke: own0.009707s, children0.037892s. These measured
intervals are not pure capture cost or background-subtracted attribution.

The actual scene includes offscreen/geometry change, failed first scroll dispatch
and recovered six down/up pairs under display occlusion. Isolated selected pixels
preserve synthetic rows; display samples fail intended-document preservation.
Keep that useful interference evidence and failed primary, rather than recreate
a clean benchmark. Requested60fps is not actual60fps delivery; static/SCK source
updates vary. No calibrated GPU/encoder occupancy, thermal plateau, saturation,
P80 production estimate or safe host admission threshold follows.

Earlier authored330s normal-pressure/nominal-thermal profile remains separate.
Choose explicit shorter takes and useful app checkpoints, inspect actual bytes,
journal loss/reader budgets and encoded coverage, and stop only the affected owned
take on observed failure. This collector adds diagnosis, not automatic capacity
admission or full-shot insurance. See GATES.md stage48 and AGENT-USAGE.md.
