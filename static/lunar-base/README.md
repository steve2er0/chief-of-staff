# Lunar Base visual slice

The shared infrastructure / varied work-pose iteration is documented in [WORKSHOP.md](WORKSHOP.md).

One warm-lit habitat, one research console, two miniature animated astronauts.
The default Canvas scene is a visual demo. Its activity states are scripted and
synthetic; this mode reads no projects, assignments, tokens or telemetry.

An optional **Lunar Base · live view** now reads the existing authenticated CoS
snapshot at `/lunar-base/?mode=live`. See [LIVE.md](LIVE.md) for its read-only
boundaries, supported states and launch instructions.

## Run on this Mac

From the Chief of Staff project:

```sh
python3 -B app.py --port 8893 --data-dir /tmp/cos-lunar-demo --no-browser
```

Open the private launch URL printed by the app, then choose **Lunar Base demo**
in the sidebar. After establishing that session, the page is
`http://127.0.0.1:8893/lunar-base/`. If the port is occupied, use another port.
The regular CoS UI and private session protections remain in place.

For a standalone visual preview without CoS, serve this folder directly:

```sh
python3 -m http.server 8894 --bind 127.0.0.1 --directory static/lunar-base
```

Then open `http://127.0.0.1:8894/`. The CoS return link only works when served
through the app. No installation is required for either runtime.

## Controls

- Click a crew member, habitat or console; keyboard users can select the buttons.
- **Pause motion** freezes both path position and animation poses; **Resume**
  continues from that instant. Space does the same when the Canvas has focus.
- Reduced-motion preference starts the page paused. Turning the preference on
  during playback pauses it. Resume is an explicit opt-in.
- Background tabs freeze scene time. Returning does not jump the characters.
- The full 768×512 scene fits the viewport; selection details sit beneath it.

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
Both crew members take turns at the one console, on a continuous foreground route.
The shared circuit keeps them clearly separated.

To rebuild assets (Pillow is needed only for this step):

```sh
python3 static/lunar-base/source/prepare_assets.py
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

## Scope

This is the first visual slice, with a single fixed scene and scripted behaviour.
The default mode has no live agent integration, user-directed pathfinding, interior navigation,
game economy or token-driven growth. Character directions use a side view with
mirroring, rather than a full eight-direction atlas. No paid service, real agent
job, deployment or push is part of this demo.
