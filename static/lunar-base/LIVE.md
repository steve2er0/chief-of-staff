# Lunar Base · live agent workspace

Open the private launch URL printed by Chief of Staff. The root page is the live
Lunar Base. `/lunar-base/` and previous `?mode=live`, `attention`, `workshop`,
`placement` and `demo` URLs all open this same workspace. Product navigation has
one map, with panels for Results, Needs you, Projects and Settings.

## Manage work on the map

Use **Start agents** to choose a project or folder and enter multiple independent
instructions. Project context opens from Projects and provides a preselected start
button. Selecting an astronaut opens its progress, conversation, native questions,
tool permission requests, reply/continue form, returned work and earlier results.
Results collects every returned turn, including partial work and file snapshots.
Acceptance is optional and does not gate continuation.

All projects share one complete base: habitat, adjacent console, lander, holographic
model platform, engine test stand and the original connecting floor guides. Home
centers that base. Project names label the astronauts and crew list; the Project
filter shows one project's agents in place. Filters and agent selection do not move
the camera or create scenery. Descriptive metadata prefers workstations, allocated
globally so workers from different projects never share a station on the same crew
page. The base is present even before the first project or agent exists.
Generic work animations match the assigned station: console operation at the
original console, assembly at the habitat, inspection at the model, and scanning,
sensor attachment or welding around the lander and test stand. Projects share
these existing structures; additional agents do not add consoles.

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

Drag to pan, use arrow keys with the canvas focused, and zoom, or use Home to center
the shared base. Pause and Space freeze illustration while state polling continues.
Reduced motion starts paused. Positions stay in `cos.lunar.layout.v1` in this
browser; they do not alter the operational store. Crew display pages hold ten astronauts across all projects; the list retains every
filtered agent and selecting one shows its page. Display paging does not cap agent
execution. Earlier per-project visual registries migrate to a shared crew registry.

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
