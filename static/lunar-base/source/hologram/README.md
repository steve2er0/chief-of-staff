# Ambient hologram cycle

The original rocket holds for 9 seconds, scans gently into a crew capsule over
3 seconds, holds for 9 seconds, then scans back over 3 seconds. The 24 second
cycle is decorative scenery and makes no claim about an agent or engineering
result. Two hold variants reduce projection alpha by at most 4/255.

Two short cyan highlights, ticks and small markers travel along the existing
tilted ring paths in opposite directions, one revolution per 24 seconds. The
ring geometry is in `orbits.json`. Rear markings draw behind the registered
rocket/capsule and front markings draw over it. Their alpha changes gently with
depth; they do not flash or move the physical projector. The base atlas remains
unchanged. The browser draws these small markings directly, with no extra image
downloads or texture atlas. `orbit_motion.py` uses the same geometry for previews.

Every frame uses the original 675 × 735 registered canvas, displayed at the
existing 225 × 245 logical size with ground anchor (112.5, 245). The morph atlas
changes only inside the central projection mask; moving ring markings remain
above the hardware. The physical projector, shadows, orbital panels, authored
layout, depth ordering and ground contacts stay fixed. Frame 0
of the underlying morph atlas is byte-identical to the existing packed rocket.

`capsule-original.png` is the saved successful built-in imagegen edit. It is not
regenerated at runtime or during a build. The original rocket master remains in
`../workshop-hologram-original.png`; source and atlas hashes are in `manifest.json`.
The imagegen direction was: replace only the central upright cyan wireframe
rocket with a shorter, wider crew capsule and service module; preserve the
transparent canvas, projector footprint, perspective, orbital rings, panels,
pixel-art style, cyan palette and ground anchor. No background or text.

`prepare_animation.py` registers the saved masters against the original bounds,
keeps the original projector outside `projection-mask.png`, and builds the atlas,
GIF and contact sheet. It requires Pillow only when rebuilding assets:

```sh
python3 static/lunar-base/source/hologram/prepare_animation.py
python3 static/lunar-base/source/build_scene.py
python3 -B -m unittest discover -s tests -p test_hologram.py -v
```

The renderer uses its existing animation frame loop. Its independent ambient
clock freezes with Pause and while the document is hidden, and caps elapsed time
after stalls. Reduced motion always displays the original rocket, including
after pressing Resume. An unavailable optional atlas falls back to the existing
static rocket. No new timers, network requests for work, agent-state inputs or
controls are added. Ring motion shares this clock and limits ambient updates to
five per second. Pause and hidden pages freeze both effects. Reduced motion
removes the moving markings as well as selecting the original rocket.

The PNG atlas is private like other scene assets. A service running older Python
code needs a manual restart for the new allowlisted PNG route, followed by a
browser reload. No live service is restarted by this change. Until then, the
static rocket remains visible.
