# Lunar Base · shared workshop infrastructure

Historical fixture and artwork evidence. Current launch and workflow are in
[LIVE.md](LIVE.md); the old mode URLs now open the live agent workspace.

In your existing private CoS session, choose **Lunar Base · work types demo**. Its route is `/lunar-base/?mode=workshop`. The original `/lunar-base/` demo still has Astra and Sol; `/lunar-base/?mode=live` remains the optional read-only view.

For a standalone preview from this project:

```sh
python3 -m http.server 8894 --bind 127.0.0.1 --directory static/lunar-base
```

Open `http://127.0.0.1:8894/?mode=workshop`. This mode reads no API or real worker data. Four labeled outposts have two scripted characters each: a shared lander, holographic rocket platform, engine test stand, and the approved habitat with its adjacent exterior console. Characters assemble, scan, weld, attach sensors, inspect tablets and operate consoles, with slow lunar bounds between positions. The eight characters are illustrative and are never inserted into CoS records.

## Live mapping and honesty

The scene model exposes each project's infrastructure type and each worker's illustrative role. It uses existing project name/vision/goal and task title/goal/purpose/output names. Explicit test-data cues select the test stand, flight-data/telemetry cues select the lander, and analysis/model/simulation cues select the holographic platform. Project metadata takes priority; otherwise the most common task work type is used, with deterministic ties. Unknown or miscellaneous work uses the original habitat and exterior console.

Tasks naming assembly, welding, scanning, sensor attachment, console operation or inspection get the corresponding visual role. Other tasks receive a stable illustrative station role from their existing worker slot. Miscellaneous agents can operate the adjacent console or work on habitat panels. Details show the exact source task, lifecycle, timestamps and reported tool event separately from the chosen illustration and its basis. None of these poses claims that a software agent physically operates hardware, or supplies missing telemetry.

Live reads remain authenticated same-origin `GET /api/state`; there are no launch, approval, settings or operational write controls. Simulated/unstarted records remain excluded from live astronauts. The live QA preview is explicitly labeled **QA FIXTURES**. Workshop mode has separate local layout storage and accepts scripted workers only through its explicit mount option; an API's demo flag cannot enable them in live mode.

Project ID slots retain their original placement. Related agents share one project's main infrastructure and use distinct stations, roles and phase offsets. Crew paging, depth ordering, clickable exact details, camera controls, pause and reduced motion remain available. Workshop time freezes while paused or hidden, so scripted area changes do not change a paused pose.

## Artwork and rebuilding

Three new infrastructure sprites and twenty work poses were generated with built-in imagegen using the actual approved reference and existing assets. The unchanged selected originals and prompts are in `source/workshop-*-original.png` and `source/workshop-prompts.json`. Separate transparent runtime cutouts and work atlases are in `assets/`. `source/workshop-asset-manifest.json` records hashes, dimensions, helmet axes and boot baselines.

`prepare_workshop_assets.py` extracts connected character components, preserves tool effects, applies deterministic alpha cleanup, registers a 50-pixel body at the common boot baseline, and creates a restrained amber suit-trim variant. Every frame was visually inspected. It also packs the additions into the existing private astronaut textures; their original 18-pose regions are pixel-identical to `source/workshop-*-base.png`. This keeps the original scene working and requires no new server routes or operational process restart.

```sh
python3 static/lunar-base/source/prepare_workshop_assets.py
python3 static/lunar-base/source/build_scene.py
node static/lunar-base/source/test_workshop_model.cjs
python3 -B -m unittest discover -s tests -q
```

Pillow is needed only for rebuilding/validating assets. The app runtime has no new dependency. If rebuilding the initial assets with `prepare_assets.py`, run the workshop preparation afterward to restore the expanded textures.

## Validation and deliverables

- Current full suite: **210 tests passed**. Three focused workshop tests passed again after the final visual label correction. Syntax and diff whitespace checks pass.
- Mapping tests cover work types, shared infrastructure, varied stable roles, habitat fallback, immutable source data, additions/reorder/reload, live/demo isolation, repeated running/block/review/stale transitions, pagination, and lunar bounds.
- Asset tests prove preservation of both original atlas regions, binary alpha, common head/boot registration and distinct work frames.
- Mac Chrome checks covered all four project choices, the new artwork, exact task provenance, explicit fixture/demo labels, original CoS Projects navigation and the original two-astronaut demo.
- Pause yielded **identical actual Canvas pixels** in two captures. Reduced-motion emulation started workshop, live view and original demo paused. The temporary QA tab was closed afterward.
- Actual game motion evidence contains **55 sampled Canvas frames / 48 distinct frames / 12.73 seconds**. The GIF and six-frame sheet are in `evidence/workshop-flight-actual-motion*`; no poses were reconstructed to create that clip.
- The isolated QA fixture store was unchanged at shutdown and active workers were empty. All CoS operational reads remained GET; eight QA-only capture saves wrote image/animation files exclusively to the temporary evidence directory. Real CoS data/processes were never opened for mutation or restarted.

`evidence/workshop-asset-contact-sheet.png` and `workshop-asset-actions.gif` show the actual asset kit. `workshop-implemented-scenes.png` collects actual scene captures. The miscellaneous capture precedes the final small project-label repositioning. Machine-readable checks are in `workshop-validation.json` and `workshop-motion-validation.json`.

Library's supported batch upload workflow failed before preparation with `Library prepare_uploads is not available`. No image/GIF Library files or verified IDs were returned. Local visual deliverables remain available; no alternate image-upload route was substituted. Browser blob downloads were unsupported, so the isolated QA harness saved actual captures locally. Browser developer emulation calls were unusually slow; ordinary scene controls and the local capture route worked.

The new live artwork was browser-tested with synthetic fixture metadata. No real running agent was launched to exercise it. There is no external-session discovery, token telemetry, measured progress, game economy, push or deployment in this iteration.
