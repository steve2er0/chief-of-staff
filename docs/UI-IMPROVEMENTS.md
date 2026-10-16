# CoS UI improvements review

All 15 requested changes are implemented against baseline `d19fd1a`, including
the owner's later preference for a simpler composer. Existing projects, conversation history, settings,
runtime databases, and the pre-existing `generated_images/` folder were preserved.
The operational app was gracefully restarted with the owner's approval after
confirming zero active jobs. Its startup arguments and working directory were
retained; configuration, projects and task/conversation records matched their
pre-restart values. Live API and browser checks confirmed measured CPU/RAM.

| # | Result | Verification |
|---|---|---|
| 1 | Inline/block equations use local native MathML; incomplete, malformed, and unsupported TeX remains escaped source. | Streaming-prefix, code/URL boundary, injection and real Chrome rendering checks. |
| 2 | Submit and Let's go share the existing reply path. Planning is requested in the user's own prompt; Let's go sends a normal explicit go-ahead with any typed additional instructions and existing permissions. | Busy/request, empty ghost, draft preservation, and real browser request checks; no separate Plan button or mode notice. |
| 3 | Sent feedback occupies a separate composer row. | Browser bounds confirm feedback does not overlap Submit. |
| 4 | Working / Finished / Needs you and Projects link directly to conversations; actual lifecycle labels remain visible. Linked questions are counted once. | Immutable projection, linked-request count and browser navigation checks. |
| 5 | Explicit local image references render inline and enlarge in a dialog. | Authenticated raster byte validation, privacy/path tests and real browser preview/enlargement. |
| 6 | New project requires only a working directory; its basename supplies the name. Existing metadata remains editable. | Backend preservation tests and browser creation in a temporary folder. |
| 7 | Corner HUD reports cached app-host CPU/RAM and selected-agent native last-request context; missing values say Unavailable. | Real Mac native APIs; mocked Windows APIs, cache and protocol tests. |
| 8 | Generated filenames are plain text with a separate Show in folder button. Files select in Finder/Explorer; directory references open that directory. No Download action or automatic download fallback appears in these entries. | Privacy/CSRF/idempotency, file/directory platform tests, missing-file and copyable-path checks, plus native Mac reveal. |
| 9 | Enter submits; Shift+Enter inserts newline. IME and repeated keys do not double-send or accept ghost drafts. | Composition/key regressions and real Chrome keyboard submission. |
| 10 | Rover and garage moved left; crew stations follow safely. | Full raster-frame, badge, label, geometry and crowded return-route checks. |
| 11 | Drawers use one responsive width. | Browser width comparison and 900px/390px window checks. |
| 12 | Active astronauts vary cosmetic typing, inspection, hammering, welding, scanning and nearby movement. | All-area routine/state, immutable-source, full-pose destination bounds and crowded traffic checks. |
| 13 | Connection is top-left; agent count top-right. Redundant Refresh is removed. | Existing automatic update flow and real browser HUD checks. |
| 14 | The base always includes all projects; the project filter is removed. | Browser all-project navigation and immutable model checks. |
| 15 | Main Pause, zoom and Home buttons are removed. Settings includes reduced motion, respecting the OS preference. | Renderer lifecycle tests and a frozen canvas in browser QA. |

## Validation

The full Python discovery suite passes **416 tests**. The native macOS Chrome QA
script passes **31 checks**, with no browser JavaScript exceptions, using only
synthetic data and a separate browser profile. It records screenshots and a short
animation in ignored `.local/` storage. No model or worker is launched by that
fixture. Run it explicitly with:

```sh
python3 -B -m unittest discover -s tests -q
python3 -B tests/ui_browser_qa.py
```

Browser QA uses the already installed native Google Chrome, `websocket-client`,
and Pillow. These are QA tools only; the app still requires no pip/npm install.
The schedule-persistence regression now supplies its own clock without allowing
the real current time to trigger an unrelated default briefing.

## Practical limits

- The prior operational process lacked the `host_metrics` field, explaining both
  unavailable host readings. An approved, idle-only graceful restart loaded the
  new backend, and the live API plus browser HUD then showed measured values.
  Refreshing a page alone cannot update an older running Python process.
- Planning uses ordinary prompts. Let's go is an explicit continuation message;
  it does not change collaboration mode, sandbox, or approval permissions.
- Math supports common TeX syntax, not arbitrary LaTeX packages or macros.
- Inline previews support PNG/JPEG/GIF/WebP up to 20 MiB. SVG, PDF and other files
  retain their plain filename and Show in folder action; active formats are not
  embedded in the app. Filename clicks do nothing; image thumbnails still enlarge.
- Reveal resolves files and directories only in the captured run folder, or in
  an explicitly named original checkout recorded with that run. The UI identifies
  the scope. An exact, unambiguous recorded-folder basename can identify that
  folder; relative child paths never search another checkout. Existing preview
  and download API roots are unchanged. Missing files produce errors, while an
  unavailable host file manager provides a verified copyable host path. Remote
  browser clients cannot use this action to open their own machine's file manager.
- Context is the latest native model-request token count and context window,
  with its timestamp, rather than an estimate of live thread occupancy. A new
  run clears the previous measurement. CPU is unavailable until two samples exist.
  RAM includes reclaimable physical cache and can differ from Activity Monitor.
- The context HUD also explains missing telemetry. Runs without a saved native
  reading remain unavailable; restarting cannot reconstruct an earlier reading.
  A reported token count is still shown if the CLI omits its window limit, with
  no estimated percentage. Request counts include reported input/output tokens;
  they are not live current-context occupancy. Disconnected or stale snapshots
  label a saved value as the last known request. Synthetic tests cover persistence,
  latest-run selection, missing limits and stale state without starting a model.
- Windows native measurement structures and Explorer dispatch are unit-tested
  with mocks. No actual Windows PC was available. macOS measurements and native
  Finder reveal were exercised directly; Finder's separate automation selection
  query was unavailable, so the UI truthfully says selection was requested.

## Changed files

- Backend: `cos/agents.py`, `artifacts.py`, `live_agent.py`, `metrics.py`,
  `progress.py`, `server.py`, `service.py`.
- Workspace: `static/index.html`, `app.js`, `attention.js`, `workspace.js`,
  `agents.js`, `task-feedback.js`, `status-navigation.js`, `ui-improvements.css`,
  `artifacts.js/.css`, `conversation-tools.js/.css`.
- Lunar sources: `availability-model.js`, `base-layout.js`, `live-view.js`,
  `hud-model.js`, `workspace-styles.css`, `build_scene.py`; generated `scene.js`
  and `workspace.css` are rebuilt from those sources.
- Tests: `test_app.py`, `test_lunar_availability.py`, `test_artifact_ui.py`,
  `test_artifacts_metrics.py`, `test_conversation_tools.py`, `test_ui_navigation.py`,
  `ui_browser_fixture.py`, `ui_browser_qa.py`, and lunar availability, hologram,
  HUD and cosmetic-routine Node checks.
- Documentation: this report and `README.md`.

Private launch tokens, logs, browser profiles, databases and QA captures are not
part of the source changes.
