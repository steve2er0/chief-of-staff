# Lunar Base live workspace

The live map is the Chief of Staff home screen. Start multiple agents, select an
astronaut to follow or reply, and open Results, project context or Settings in
side panels. See [LIVE.md](LIVE.md) for status, controls, architecture and safety.
All projects share one original habitat, adjacent console, lander, holographic
model platform and engine test stand, with the original connecting floor guides.
Astronauts come from recorded agents; infrastructure does not create extra crew.
Project names appear on crew labels and in the project filter. Filtering keeps the
base, camera and global crew positions fixed. Home centers the complete base.

Start CoS normally with `python3 -B app.py --port 8876` and open its private launch
URL. Do not run a second service against an already-open data directory. Previous
Lunar mode URLs open the same workspace; demos are no longer product views.

## Assets and provenance

The approved Library art-direction board
`libfile_5ba266f111c08191aeb9f47b7ab6f7dc`, version 0,
`exec-1d86c474-b31e-440d-9933-77bf65ee4a72.png`, was materialized by the supported
Library consumer flow into this task's Mac workspace and its pixels were viewed.
It remains unchanged and keeps its Library identity. It is a static style board,
not an animation atlas.

New raster artwork was generated with built-in **image_gen**, using that board
as a style reference. `source/prompts.json` contains the initial prompts;
`source/terrain-revision.json` records the accepted open-ground revision.
`source/*-original.png` are the unchanged selected generated originals.
`source/asset-manifest.json` records dimensions, SHA-256 hashes and frame anchors.

`source/prepare_assets.py` uses Pillow for deterministic alpha-edge cleanup,
nearest-neighbour sizing and frame extraction. All frames have a registered
helmet axis and boot baseline. Amber is a suit-trim palette variant of the same
atlas; the visor highlights are preserved. The static building and console PNGs
contain no astronauts. No ground or static screenshots are panned to simulate motion.

The 6×3 atlas rows are **walking, idle, working**, with six poses each.
Locomotion uses slow lunar bounds: a 0.4-second planted push-off, 2.3-second
airborne arc and 0.4-second soft planted landing. Each bound travels 30 logical
pixels and rises 12 pixels at its apex. Horizontal movement happens only during
flight; push-off and landing hold position. A separate ground shadow stays on the
surface and softens during flight. Feet stay planted while typing.
Leftward poses mirror the side-facing atlas. Objects draw in foot-depth order.
The original development demo has two crew members on a shared console circuit.
The live workspace uses stable agent stations and activity-driven motion; it does
not run that scripted crew cycle.

The live renderer uses full-resolution terrain and 3x registered prop and crew
regions, packaged from the same unchanged artwork masters. Its canvas backing
surface follows the displayed size and device pixel ratio; camera coordinates,
movement and pointer picking remain in 768 × 512 logical units. Legacy atlas
regions remain intact for development fixtures. `source/display-asset-manifest.json`
records the display regions, output sizes and hashes.

The map and drawers share navy/slate surfaces, cyan actions and system sans-serif
type. State-key swatches come directly from the scene's state definitions. Reports,
file lists, earlier turns and configuration explanations expand on demand; saved
instructions and reports are retained. Report Markdown is escaped before rendering,
with web/API links only and no embedded HTML or images.

To rebuild display assets and the live bundle (Pillow is needed only for assets):

```sh
python3 static/lunar-base/source/prepare_display_assets.py
python3 static/lunar-base/source/build_scene.py
```

## Verify

```sh
python3 -B -m unittest discover -s tests -q
node --check static/lunar-base/scene.js
node --check static/lunar-base/simulation.js
node static/lunar-base/source/test_simulation.cjs
```

The HTTP tests cover existing private-session requirements, the exact asset
allowlist, MIME types, blocked unknown/source paths and unchanged service state.
Motion tests cover route continuity and speed, all walk poses, both console
shifts, character separation and pause/background clocks.

## Development fixtures

The original scene, workshop, placement and attention demos remain in `source/`
for model, motion and artwork tests. They are excluded from product navigation
and the served scene bundle. Historical scripted motion evidence does not prove
real provider execution. See [VALIDATION-LIVE.md](VALIDATION-LIVE.md) for current
integration evidence, [WORKSHOP.md](WORKSHOP.md) for work-pose provenance and
[ATTENTION.md](ATTENTION.md) for request semantics and attention artwork.
