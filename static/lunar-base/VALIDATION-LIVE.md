# Read-only live-view validation · 2026-10-13

- Full current repository suite: **201 Python tests passed** in 14.710 seconds after reconnecting to the Mac.
- Four focused live-view tests cover authenticated existing routes, repeated GET reads with launch/coordinator/store/audit mutations forbidden, unchanged database dumps, isolated snapshot transitions, pure mapping and the client GET-only boundary.
- Pure model tests cover supported state categories, unknown/missing proof, simulated/unstarted exclusions, stale/future timestamps, agent-reported blockers, immutable source data, stable layout across additions/reordering/reload/deletion, corrupt registry handling, 25 workers across three pages, clear station separation and planted moon bounds.
- Shared original demo motion tests pass; minimum ground separation is **67.3 logical pixels** across two full cycles. Prior live-sampled demo motion evidence remains in `evidence/lunar-base-bounds.gif` and `motion-validation.json`.
- Actual Chrome inspection of the live view used an isolated, explicitly labeled QA fixture service with three projects and eight recorded worker runs. Confirmed multiple project/crew selection, running versus reported blocker, unstarted/simulated assignments retained only in details, record/session/time provenance, pause controls, empty state with zero buildings/crew, HTTP 503 disconnected state retaining the last snapshot, and successful reconnect. The scene's raster artwork was visually inspected in the real local browser.
- The first fixture request log contained **5,135 requests, all GET**, including 5,117 state reads. No real worker or paid call was started. The retry harness also disables POST and never opens operational CoS data.
- Original CoS briefing, Projects and Settings loaded through their normal private session with the optional live and synthetic sidebar links. Original synthetic demo and its earlier navigation, responsive, reduced-motion and actual sampled-animation checks are documented in `VALIDATION.md`.

## Limits of this validation

Browser developer frame-capture calls became unreliable during a Mac/browser disconnect and returned only after long delays. The live view was inspected visually and its shared motion/model was tested, but a new frame-by-frame live-transition capture and new live-view clip are **not confirmed**. The existing GIF validates the synthetic scene's shared lunar motion, not live telemetry transitions.

The operational port-8876 browser attempt was blocked before a private CoS session was established. This milestone's browser telemetry checks used synthetic fixtures, not real running agents. Open the normal existing private launch URL and choose the live sidebar link to evaluate your own current records. No authentication protection was bypassed, no operational process was restarted and no source/config/data mutation was used to produce active agents.

The client only sees records exposed by this CoS service. It cannot supply external agent inventory, continuous liveness, token totals or measured progress. Two minutes of silence means stale, not proof that a process stopped. Local visual slots persist only in that browser origin.
