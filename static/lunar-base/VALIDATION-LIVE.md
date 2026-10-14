# Live workspace validation · 2026-10-13

The full suite passed **302 tests** after the integration. Focused model and HTTP
checks cover one astronaut per persistent agent, position continuity across turns,
queued/simulated stationary labels, finished managed results, all native activity
names, native questions and permissions, sending/resolution state, obsolete linked
questions, old-mode URLs opening the same private workspace and unchanged GET
security. Existing transport, process cleanup, idempotency, worktree, artifact and
HTTP safety tests remain in the suite.

An isolated in-app browser fixture exercised two concurrent local protocol workers:
batch start; native question and answer; preservation of an unsent draft; direct
same-session continuation twice without another astronaut or approval step; live
steering; results for earlier turns and file snapshots; project-preselected launch;
exact command permission display and decline; Stop during a pending question;
cleared question marker; paused-agent continuation controls; switching panels while
the map stays visible; canonical old-mode URL handling; disconnect freeze; automatic recovery after an
initial HTTP 503 state request without losing the map container.
Browser warning/error logs were empty before the deliberate disconnect check.

The fixture uses real local subprocess pipes and the production API/UI, with
synthetic JSON-RPC replies. It uses a fresh temporary state directory and never
opens operational CoS data, invokes a model, grants actual command access, or
changes the user’s running service. It validates integration and presentation,
not live provider reliability or Windows process behavior. Initial integration screenshots
show fixture data. No new frame-by-frame live motion recording was made; earlier
motion GIFs demonstrate scripted/shared animation only.

Two minutes of activity silence means stale, not proof that a process stopped.
The client has no independent external-agent inventory, measured progress or token
usage. Visual slots remain browser-local. Raster assets were preserved unchanged
by this workspace integration.

## Shared equipment and separated crew positions

Each of the five existing structures now has three spaced crew positions with
three distinct existing animations. There is still one exterior console; its
other positions scan and inspect. Even identical review instructions retain
varied poses. Live tool/lifecycle transitions keep astronauts at their stations.
Project labels fit the available spacing and hide below 0.5 zoom; full names stay
in the list and filter. Display pages hold sixteen crew, with no execution limit.
Version-2 browser registries migrate their original ten-slot station/page indices
to version 3. The original structures, paths and raster artwork are unchanged.

Validation on 2026-10-14:

- **347 tests passed against the latest checkout before Git delivery**; the
  earlier isolated layout snapshot passed 346. Coverage includes 64 synthetic
  agents from multiple projects,
  three workers and distinct poses at every structure on each display page,
  repeated task wording, preferred equipment, stable continuations, fixed
  anchors through native tool/status changes, and legacy registry migration.
- Clearance checks use every work, idle and attention frame from both shipped
  display atlases, mirrored orientations, padding, attention circles and the
  maximum project-label bounds at zoom 0.18, 0.4, 0.5, Home and 1.5.
- All **29 JavaScript/CJS files** passed syntax checks. Scene and styles reproduce
  byte for byte; the whitespace check passed.
- The isolated read-only browser fixture showed sixteen agents sharing the
  unchanged base. With 64 agents, all remained listed across four display pages;
  selecting the last agent opened its conversation and fourth map page. Filtering
  Beta retained all twenty of its agents. Writable endpoints and model calls
  remained disabled. This is synthetic layout validation, not real agent work.
- The fixture used only 230 GET requests and stopped with its operational store
  unchanged. The operational app was reconnected and showed its two existing
  finished agents at their retained stations. No browser warnings/errors were
  observed; no real agent was started, stopped or sent instructions during QA.

## One shared base for all projects

The live projection now supplies one shared base, including the five original
structures and unchanged connecting paths. Projects label agents and filter the
crew in place. Global station allocation prevents collisions across projects;
version-1 browser layout registries migrate to shared crew positions. Every agent
remains listed, including agents on other display pages; display paging does not
limit execution. An empty workspace still renders the complete base.

Validation for this change:

- The full suite passed **339 tests**. Model fixtures cover 36 agents across three
  projects, cross-project work/home separation, persistent positions after adding
  projects and reloading, immutable project filters, legacy registry migration,
  empty scenery and sparse display pages.
- The generated scene and scoped styles rebuild byte for byte, and changed
  JavaScript files pass syntax checks. No raster artwork changed.
- The isolated read-only browser fixture showed three projects sharing one base.
  Project filtering preserved the camera and infrastructure. Adding a fourth
  project and three agents kept the same scenery; selecting an agent on the
  second crew page retained All projects and opened its conversation. Empty
  project/task lists retained the complete base. Fixture interactions used only
  GET requests; writable endpoints and model calls were disabled.
- The operational live app was opened with All projects selected. Its actual CLI
  astronaut opened the existing conversation, and its project label was visible.
  The active agent/session was not restarted or sent new instructions. No browser
  warnings/errors were observed. This verifies the live view, not the agent's
  engineering result or reported checks.

Earlier multiple-outpost validation below is historical and superseded by this
shared-base layout.

## Complete live base restoration

The full suite passed **334 tests**, all 27 JavaScript/CJS files passed syntax
checks, and the scene rebuilt deterministically. Model fixtures check reuse of
all five original structures and connecting paths, no crew for an empty project,
separate project footprints, crew separation in every work-area layout, stable
continuation identities and paged positions.

The operational in-app browser was reconnected to its current service and checked
on the live route. All infrastructure and paths were visible together. Selecting
the actual astronaut opened its existing conversation and result controls; its
state updated from Working to Finished when the CLI result arrived. The overview
fit the complete scenery. No additional project agents or model calls were started
for this visual change, and the running service was not restarted. This verifies
the live map integration, not the engineering claims in that agent's report.

## Results drawer (2026-10-14)

The full suite passed **344 tests**, source syntax checks passed, and the generated
scene/styles rebuilt deterministically. Regression checks cover saved outcomes
after continuation, positive and negative prose checks, explicit safe preview
links, retained missing-file warnings, history grouping, and distinct disclosure
keys for each saved run.

An isolated read-only browser fixture verified filename-first Files controls,
collapsed technical metadata, visible blockers, discussion replies, and the
return path from a saved result. Adding a result retained open sections, focus,
and the reading anchor within one pixel. Back to Results retained expanded
history and the selected project filter. At 390 by 844, document and drawer widths
were both 390 pixels. The temporary viewport was reset. The fixture used no
provider calls or operational records; its store remained unchanged.

The live Results drawer was also checked against saved operational reports.
Preview links remain agent-supplied links, reported checks remain agent claims,
and captured files retain their existing integrity checks. No result was accepted,
no real agent was launched or stopped, and no service restart was needed.

## Compact Details panel (2026-10-14)

The full suite passed **345 tests**. Presentation regressions cover current-run
request ownership, saved-run cutoffs, exact preserved instructions, captured
permissions, Windows folder labels, meaningful activity and fresh-session choices.
All Python and JavaScript sources passed syntax checks, and generated assets
rebuilt with unchanged hashes.

An isolated read-only browser fixture checked completed, active and no-session
runs. Current request, workspace and access stay visible; instructions, paths,
run settings, session metadata and activity start collapsed. Session copying
worked and the clipboard was restored. Selecting a fresh session retained its
indicator with Continue options collapsed. No-session runs clearly require a
fresh session; active runs do not offer that option. Incoming requests retained
expanded sections, focus and the reading anchor within one pixel, including
after switching tabs. At 390 by 844, the drawer and document were 390 pixels
wide and the panel had no horizontal overflow. The temporary viewport was reset.

Reloading the existing operational browser tab was blocked by Chrome with
ERR_BLOCKED_BY_CLIENT, so this change has isolated browser verification rather
than a completed live-service browser check. No operational records, worker
sessions, execution permissions or running service were changed.
