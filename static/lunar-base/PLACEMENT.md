# All-infrastructure placement review

Open **All infrastructure** from the original or work-types demo, or choose **Lunar Base · all infrastructure** in CoS. The route is `/lunar-base/?mode=placement` in your existing private CoS session.

This is one 1152×768 synthetic landscape using the existing habitat, adjacent exterior console, lander, holographic rocket platform and test stand. Existing solar arrays, dishes, equipment boxes and test instrumentation remain part of their original sprites. Seven representative astronauts demonstrate console operation, panel repair, sensor attachment, scanning, inspection, welding and a gentle corridor walk. Equipment and crew keep their existing relative sprite scale. Dashed paths are proposed placement guides; no real agent data or telemetry is used.

All equipment fits. The console intentionally touches the habitat as in the original composition; other equipment rectangles are separate. The walker clears all equipment, and work positions are distinct. Pause, Space, reduced motion and hidden-tab clocks are supported. Clicking equipment or the work-area buttons opens its placement description.

Validation: **220 full tests passed**, including two placement tests. JavaScript syntax and diff checks passed. Actual Mac Chrome inspection verified full-scene fit, area selection, pause, and navigation from both existing demos. The isolated fixture store was unchanged at shutdown, with zero active workers. No real jobs, push or deployment occurred.

The actual full-scene PNG is `evidence/lunar-base-all-infrastructure-placement.png` (1152×768, 1,546,830 bytes). It was saved through the supported direct Library route as `libfile_b091f28b08fc81919236385f2eea39c5`, File Service ID `file_000000001514823097d68f6985cb8765`.

Implementation: `source/placement-model.js`, `placement-scene.js`, `placement-styles.css`; bundled using the existing `scene.js`/`lunar.css` routes. Only optional navigation links were added to the original/workshop/live pages. The live model, operational API and assets were preserved.
