# Lunar Base · live agent workspace

Open the private launch URL printed by Chief of Staff. The root page is the live
Lunar Base. `/lunar-base/` and previous `?mode=live`, `attention`, `workshop`,
`placement` and `demo` URLs all open this same workspace. Product navigation has
one map, with panels for Results, Needs you, Projects and Settings.

## Manage work on the map

Use **Start agents** to choose a project or folder and enter multiple independent
instructions. Selecting an outpost opens project context and a preselected start
button. Selecting an astronaut opens its progress, conversation, native questions,
tool permission requests, reply/continue form, returned work and earlier results.
Results collects every returned turn, including partial work and file snapshots.
Acceptance is optional and does not gate continuation.

Each project has a complete base: habitat, adjacent console, lander, holographic
model platform, engine test stand and connecting paths. Focus shows the entire
base; All outposts fits every project. Selecting any structure opens its project.
Descriptive metadata chooses agent workstations within the base. Paths and work
poses are illustrations; crew counts and status come from recorded agents.

Each agent keeps one astronaut across continuations. The current turn uses the
same `agent_id`, suit, browser-local slot and selection. Old turns remain history
and results. Active or recovery-locked coordinator calls are separate crew;
completed historical calls do not accumulate on the map. The app does not discover
independent CLI windows or external Codex sessions.

## Status and motion

| Evidence | Illustrated state |
| --- | --- |
| Confirmed running worker with activity within two minutes | Working; illustrative pose or finite lunar journey |
| Native question or exact tool permission request | Waiting for you; amber question marker |
| Response is being sent | Stationary; response saved / awaiting agent |
| Queued, paused or stopping | Stationary; lifecycle labeled explicitly |
| Finished managed-agent result | Finished; available in Results, no acceptance requirement |
| Explicit unresolved structured owner request | Needs you; linked response controls |
| Failure, blocker or recovery lock | Failure/blocker/unknown; motion held |
| Simulated managed agent | Simulated label; no real execution motion |
| Activity silence, stale snapshot or disconnected service | Last-known state; motion held |

Native `commandExecution`, `fileChange`, `mcpToolCall` and `webSearch` events and
legacy event names are recognized. Explicit tool events select work or nearby
workspace positions; prose never invents activity, requests, measured progress or token usage. Obsolete
questions linked to superseded/cancelled turns and stopped native requests do not
leave attention markers behind.

## Controls and safety

Drag to pan, use arrow keys with the canvas focused, and zoom or select All
outposts. Pause and Space freeze illustration while state polling continues.
Reduced motion starts paused. Positions stay in `cos.lunar.layout.v1` in this
browser; they do not alter the operational store. Crew pages hold ten astronauts.

The application owns the authenticated same-origin state poll and reuses the
existing start, reply, response and Stop APIs. The renderer projects snapshots;
it does not grant permissions or mutate operational records. Ordinary replies
retain captured permissions. Native permission responses target the exact pending
request. Session/turn checks, idempotent UUIDs, cancellation, process cleanup,
recovery locks and file conflict protection remain in place.

## Source and verification

`static/agent-model.js` is the shared immutable agent/result selector.
`source/base-layout.js` supplies the original scenery and connecting paths;
`source/live-model.js` maps state and agent stations; `source/attention-model.js` maps
explicit requests; `source/live-view.js` renders the scene; `static/agents.js`
supplies the operational panels. Source demos remain developer fixtures and are
excluded from the shipped scene bundle.

```sh
python3 static/lunar-base/source/build_scene.py
node static/lunar-base/source/test_live_model.cjs
node static/lunar-base/source/test_attention_model.cjs
python3 -B -m unittest discover -s tests -q
```

See `VALIDATION-LIVE.md` for the current validation boundary and `README.md` for
raster provenance. No new artwork was needed for this integration.
