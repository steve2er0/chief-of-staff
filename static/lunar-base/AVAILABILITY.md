# Astronaut availability

The map reads the existing CoS snapshot. Animation is a visual metaphor, never
physical telemetry, and this update adds no operational actions or backend fields.

| Supported evidence | Behavior |
| --- | --- |
| `completed`, `accepted`, or managed-agent `ready_for_review` without an explicit pending request | Slowly bound to a separate spot outside the habitat; remain available with a dim helmet light. |
| `queued`, `pending`, `paused`, `waiting`, or `stopping` | Stay at the assigned work area; occasionally check the existing tablet animation. The exact lifecycle label remains visible. |
| Fresh confirmed `running` with in-progress `fileChange` / `file_change` activity | Existing work pose, only at the assigned work area. |
| Fresh confirmed `running` without an in-progress file event, including command/MCP/search events or completed tool events | Stay at the work area with occasional tablet checks. A running solve is never treated as finished. |
| Explicit owner request / live CLI request | Existing amber request and wave take priority. A saved answer does not resolve the request by itself. |
| Unknown, recovery lock, interruption, stale snapshot/activity, disconnection, failure, stop, or unsupported legacy review | Hold the last position and honestly retain the source label. No availability or session end is inferred. |

CoS currently exposes **no session-ended lifecycle signal** and no distinct
inter-agent-dependency wait signal. Completed turns remain available outside the
habitat; they never disappear into it. Generic waiting labels retain their exact
source meaning. Silence, prose, a completed tool call, or `session_id` do not prove
that a session ended or that an agent is waiting for another agent.

Resting is predominantly still (neutral or seated). Every 28 seconds, a four-second
look toward Earth or gentle stretch changes the pose; the foot baseline stays fixed.
Tablet checks last three seconds per 24 seconds. Existing lunar stride and flight
timing are unchanged; ground shadows retain a fixed size and opacity during bounds.

Separate resting anchors are derived from the current habitat/infrastructure and
station coordinates. Infrastructure and viewport geometry are not changed. A
visibility graph routes around current infrastructure rectangles. Astronauts yield
when the next sample would overlap another visible character; crowded paths can
temporarily hold a journey. An unavailable route is held rather than replaced by a
path through a building. Existing depth order, selection, project identity, pause,
reduced-motion initialization, and request details remain intact. An open page
starts a finished agent at rest instead of replaying a fictitious prior trip.

## Files and rebuild

- `source/availability-model.js`: pure state/route/movement projection.
- `source/availability-assets.js`: self-contained transparent rest strip, two suits.
- `source/availability/`: unchanged generated master, registered PNGs, contact sheet,
  provenance, and deterministic preparation script.
- `source/live-view.js`: targeted renderer/animation hooks.
- `source/build_scene.py`: includes new modules in `scene.js`; normal builds also
  regenerate existing CSS, so coordinate any full build with concurrent layout work.
- `source/test_availability_model.cjs`, `tests/test_lunar_availability.py`: synthetic
  states, interruption/reassignment/recovery, routing and asset contracts.

Run from the project root:

```sh
node static/lunar-base/source/test_availability_model.cjs
python3 -m unittest discover -s tests -p 'test_lunar*.py'
```

Reload the existing CoS browser page to load the updated JavaScript; no service
restart is needed. No real agent or coordinator was launched for validation.
The review GIF uses real timer-driven Canvas samples from synthetic records in Mac
Chrome. It validates motion independently of the still screenshot.

For the isolated review UI (synthetic records only), run
`python3 static/lunar-base/source/availability/review-server.py` and open
`http://127.0.0.1:8907/`. Its only write saves the explicitly requested browser
capture locally; it has no CoS backend or job endpoints.

Validation: full suite **356 tests passed**; final lunar suite **26 passed** after
concurrent geometry changes. Real Chrome capture: **119 samples, 56 distinct source
frames, 57 GIF frames, 23.96 seconds**. Original live app and Projects panel loaded
with no application console errors. Reduced-motion initialization used a fixture
MediaQueryList; Mac system settings were unchanged.
