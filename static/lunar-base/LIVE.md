# Lunar Base · read-only CoS view

The shared infrastructure / varied work-pose iteration is documented in [WORKSHOP.md](WORKSHOP.md).

Open the existing private Chief of Staff launch URL, then choose **Lunar Base · live view** in its sidebar. The route is `/lunar-base/?mode=live` on that same service. For example, an already running instance on port 8876 uses `http://127.0.0.1:8876/lunar-base/?mode=live` after authentication. The ordinary `/lunar-base/` route remains the approved two-astronaut synthetic demo.

The view reads authenticated, same-origin `GET /api/state` every 2.5 seconds while visible. It exposes no launch, approval, settings or job controls. Project and crew buttons, zoom, pan, pause and reconnect only affect this view. Output links read existing CoS outputs. The service and its security configuration are unchanged by this integration.

## What the scene represents

Buildings map to CoS project IDs. Worker records come from the snapshot's tasks and coordinator jobs; independent Codex sessions are not discovered. Task workers require a frozen `config.mode` of `codex` and a captured session, positive PID, or valid run-start timestamp. Simulated, unknown-engine and unstarted assignments remain readable in project details without becoming astronauts. A running record needs a captured session or PID and fresh activity before animation is enabled.

| Supported record | Illustrated state |
| --- | --- |
| Running, confirmed worker, activity within 2 minutes | Running; planted console work or a finite lunar journey when the reported work area changes |
| Queued, paused, pending, stopping | Waiting; motion held |
| Agent-reported blocker or failure | Blocked / failed, with the recorded lifecycle retained in details |
| Ready for review | Needs your review |
| Accepted / completed | Completed |
| Interrupted, recovery lock, missing run evidence or missing/invalid activity time | Unknown; motion held |
| Running with more than 2 minutes of activity silence | Activity stale; motion held; not declared stopped |
| Failed request / stale snapshot | Disconnected / snapshot stale; last known records retained, motion held |

Structured `activity` values determine the illustrated work area: `file_change` uses the nearby work position; supported command and plan activity uses the console. Human update prose is never parsed to invent activity. Opening the view places workers at their current illustrated area rather than replaying an invented journey. The shared moon-bound timing preserves the approved push-off, float, landing and grounded shadow. Animation illustrates reported state; it does not measure physical work or progress.

Details show the source record, captured session, lifecycle, reported blocker, timestamps, update text and available outputs. There are no token totals or inferred completion percentages. Unknown data remains unavailable.

## Layout and controls

Browser-local `cos.lunar.layout.v1` metadata stores project and worker slots by stable ID. New IDs append without moving existing slots; removed IDs retain their slots for a later return. This metadata never enters CoS's operational store. Different browsers or cleared storage may assign a new layout. Ten recorded workers per project page keep the view usable; all worker records remain accessible through crew paging.

Click buildings or crew, or use the lists below the map. Drag to pan, use arrow keys with the canvas focused, and use the zoom / All outposts controls. Pause and Space freeze the illustration while state reads continue. Reduced-motion preference starts paused. Background tabs hold motion and refresh on return.

## Source and verification

`source/live-model.js` contains pure state mapping, layout and motion helpers. `source/live-view.js` contains the GET-only browser renderer. `source/demo-scene.js` and `source/demo-styles.css` preserve the original synthetic scene. Rebuild runtime bundles with:

```sh
python3 static/lunar-base/source/build_scene.py
node static/lunar-base/source/test_live_model.cjs
node static/lunar-base/source/test_simulation.cjs
python3 -B -m unittest discover -s tests -q
```

`source/run_live_fixture.py` is an isolated browser QA harness. It requires a new empty data directory, uses synthetic records, disables POST, starts no scheduler or worker and verifies unchanged fixture database state on shutdown. Never point it at operational data. Its page is explicitly labeled **QA FIXTURES**.

See `VALIDATION-LIVE.md` for evidence and the remaining browser-capture limitation. Raster provenance and the unchanged approved Library reference remain documented in `README.md` and `source/asset-manifest.json`.
