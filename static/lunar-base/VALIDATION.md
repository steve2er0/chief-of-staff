# Visual slice validation · 2026-10-13

- Current shared repository: **189 Python tests passed**, including the four
  new private Lunar Base route/state tests. Existing model calls remain mocked.
- All five original JavaScript files plus the scene/simulation parse successfully.
- `source/test_simulation.cjs` passes continuity, viewport, six pose selection,
  two console turns, grounded console work, pause/hidden clock, planted push-off,
  prolonged float and planted landing tests. Minimum crew ground separation:
  **67.3 logical pixels** over two full demo cycles.
- Approved reference materialized to this Mac, viewed before implementation,
  preserved byte-identically, and copied into `source/reference/` with its Library
  identity metadata. Generated originals, prompts and SHA-256 manifest are retained.
- Every registered atlas frame was inspected in `source/frame-contact-sheet.png`.
- Real local Chrome checks: original briefing/Projects navigation; demo asset
  loading; direct Canvas habitat selection; crew details; pause; keyboard Space;
  dynamic and initial reduced-motion pause; 390×844 responsive layout with
  document width 390 and Canvas width 364, without horizontal overflow.
- Live frame capture after the lunar correction: **65 distinct actual Canvas
  samples**, approximately 15 seconds. GIF preserves measured timing:
  **65 frames / 15.4 seconds**, 384×256, approximately 5 fps. The six-frame motion
  contact sheet was inspected and shows both crew moving along their routes.

Evidence is in `evidence/`: final scene PNG, lunar-bound GIF, sampled-frame
contact sheet and machine-readable motion validation.

Canvas-stream WebM capture on this host produced repeated still frames even while
the live Canvas changed. Those attempts were rejected and removed from deliverables.
The accepted GIF uses live pixel samples, not reconstructed animation.

The app itself renders with requestAnimationFrame. The evidence GIF samples that
render at lower frequency; it is useful for motion review and is not a frame-rate
benchmark. No live CoS activity, real job, paid call, push or deployment was run.
