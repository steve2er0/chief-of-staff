# Live workspace validation · 2026-10-14

## Astronaut placement, Hub parking and traffic (2026-10-14)

Work spots follow rendered structure bounds. Every station serves infrastructure,
including the former open-ground inspection slot at the Hub. All 28 work anchors
are outside scenery rectangles and within 160 logical units of their structure;
shared work/attention frames retain their clearance. No extra console or scenery
was added, and station identities/manual choices remain stable.

Available agents park on the foreground ground beside/in front of the Hub. Parking
avoids actual busy/held poses, preserves existing parked identities, and uses a
consistent Hub crew scale. A green check, visible Available count and card label
make the finished state clear without changing the recorded lifecycle. Home frames
the last parking row. Explicit requests and stale/disconnected states take priority.

Regression fixtures reproduce two head-on walkers, reversed input order, held
blockers, a record appearing at an occupied point, narrow passages, all 28 agents
finishing/continuing at two frame rates, every single-busy-station parking case,
stable parking across snapshots, display-page isolation and actual rest-frame/check
clearance. Moving agents detour around all same-page peers; overlapping new records
can step out without moving farther into each other. No position teleport is used.

Read-only browser fixtures showed 28 working astronauts at realigned spots, 12
Available with 16 working, all 28 Available near the Hub, and two continuing without
a map reset. The operational live tab showed its actual two agents as Available.
Browser warning/error logs were empty. Real agents were not started or instructed.

Final checks passed: **365 full-suite tests**, **29 lunar tests**, all **27 lunar
JavaScript/CJS syntax checks**, changed Python syntax, generated scene/style
reproducibility and `git diff --check`. Browser evidence uses synthetic records
for crowded transitions; it does not claim live provider execution was exercised.

## Saved lunar base delivery (2026-10-14)

The final combined layout and availability changes passed **356 tests**, syntax
checks for all **35 JavaScript/CJS files**, the expansion preview inline script
and **24 Python files**, and the expansion asset validator. Scene and CSS outputs
rebuilt byte-for-byte identically. Scaled labels use actual walking/rest positions;
the shared-crew fixture checks their spacing at the larger astronaut scale.

The refreshed operational live page remained connected with both actual agents,
the enlarged garage, nine infrastructure choices and open terrain without paths
or a landing pad. Browser warning/error logs were empty. This delivery check
reloaded static assets; it did not restart the service or instruct real agents.
Earlier motion recordings and synthetic fixture evidence are described below.

## Initial workspace integration (2026-10-13)

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

## Landing-pad removal and centered rover facilities (2026-10-14)

Garage-size follow-up: its width and height increased by 50% at the same ground
anchor, with native proportions and the existing crew depth scale retained.
Side crew positions moved outside the larger footprint. All 26 lunar checks,
generated-asset reproducibility and changed-source syntax checks passed; the
operational live browser showed the larger garage with no warning/error logs.

The landing pad and its three crew stations are removed from the live scenery,
Work at choices and automatic placement. Launch-related metadata now prefers the
lander. The utility rover moved 380 logical units left and the garage moved 310
left, keeping their existing depth scale. No visible paths were reintroduced.
The original landing-pad artwork remains in the saved art pack.

Version-5 browser registries use 28 positions per display page across nine work
areas. Migration preserves surviving stations, page identities, suits and valid
manual/Automatic choices from 31-position version-4 layouts and earlier formats.
Retired pad choices return to Automatic, restoring their previous station when
free; full pages safely overflow. This is display paging, not an execution cap.

The full suite passed **356 tests**. Fixtures include two full old display pages,
retired automatic/manual pad occupants, retained rover choices and suits, valid
Automatic restoration, occupied positions and stable reloads. All-frame shared
crew clearance covers 112 astronauts across four pages. All **35 JavaScript/CJS
files** passed syntax checks and generated assets rebuilt identically.

A read-only 28-astronaut browser fixture showed nine choices and no pad. Choosing
the full garage opened a second display page, persisted after reload, and
Automatic restored the original station. The fixture's store remained unchanged.
The operational live tab showed the centered facilities and retained actual
agents. Both browser warning/error logs were empty. No service restart, new agent
or operational instruction was needed.

## Garage and greenhouse swap (2026-10-14)

The garage and greenhouse exchanged ground positions. The garage now uses the
distant row's 65% depth factor; the greenhouse occupies the nearer right side.
Their crew positions, support shadows and internal movement hints follow them,
while persistent station IDs and manual infrastructure choices stay intact.
Left-side crew positions keep clear of the rover and test stand.

All **26 lunar checks** passed, including mixed-depth crew/attention/label
clearance, sprite proportions and movement routes. Generated assets rebuilt
identically; changed-source syntax/diff checks passed. An isolated read-only
31-astronaut fixture and the operational live tab verified the swapped scenery
with no browser warnings/errors. No real agent was started or sent instructions.

## Open terrain without visible paths (2026-10-14)

Crew-size follow-up: the base astronaut scale increased from 1.2 to 1.4 (about
17% larger), retaining the existing per-area depth factors. Rest spacing, labels,
shadows, selection and yielding already share that scale. The hologram sensor
and lander inspection spots moved slightly apart to preserve pose/request-marker
clearance. All 26 lunar checks passed, including all-frame clearance across
124 crew on four display pages. A read-only 31-astronaut browser fixture and the
operational live view verified the larger crew with no warning/error logs.
Generated assets reproduced exactly and changed-source syntax checks passed.

Test-stand placement follow-up: moved 120 logical units right and 100 back, with
90% depth scale for the stand and crew positions. Its support contacts and
internal movement approach follow the new footprint. All 26 lunar checks passed;
generated assets reproduced exactly and changed-source syntax checks passed.
The operational live browser verified the centered, more distant placement.

The live renderer no longer paints connecting lines or floor guides. Its canvas
description and open-ground crew labels match the scene. Internal waypoint data
remains available to the obstacle-avoiding movement code; stations and scenery
are unchanged. This supersedes earlier visible-path descriptions below.

All **26 lunar checks** passed, including movement routes and crew clearance.
Generated assets rebuilt identically; changed-source syntax and diff checks
passed. The operational live view showed open terrain between every structure,
with no browser warnings/errors and no service restart or agent instructions.

## Background landing pad and service-row clearance (2026-10-14)

The garage moved right by half its width (178 logical units). The greenhouse
moved 140 units left, clear of the rock mound. The landing pad moved farther
back and uses 80% depth scale for both scenery and station positions; crew size
retains the same distance factor. The lander keeps its prior lower-right
position. Connecting approaches follow all three moved work areas; saved station
IDs and infrastructure choices remain intact.

All **26 lunar checks** passed, including mixed-scale crew/attention/label
clearance, connected paths and safe rest routes. Generated assets reproduced
identically and changed-source syntax/diff checks passed. A read-only browser
fixture displayed all 31 astronauts with clear spacing. Its store remained
unchanged; fixture and operational live browser warning/error logs were empty.
No operational agent instructions or service restart were needed.

## Hologram slide and flight-area swap (2026-10-14)

Subsequent tuning: the Hub is another 20% larger (1.656 times its native logical
size), with its sensor station clear on the right flank. The lander and its crew
moved 120 logical units left. Both approaches follow the revised footprints;
the Hub's ground anchor, hologram and landing pad stay in place. All 26 lunar
checks, generated-asset reproducibility and changed-source syntax checks passed.
The operational live browser showed the new composition with empty error logs.

The holographic platform and its crew moved 120 logical units right. The lander
and landing pad exchanged ground positions, with their station identities, poses
and shadows following them. Connected approaches reach the new footprints, and
the pad's front crew position stays clear of the engine stand.

All **26 lunar checks** passed, covering all-frame crew/attention/label clearance,
connected paths, unchanged sprite hashes, saved choices and safe rest routes.
Generated scene/styles reproduced identically; changed JavaScript syntax and
diff checks passed. A read-only browser fixture displayed all 31 astronauts with
clear spacing at the relocated areas. Its operational store remained unchanged,
and both fixture and live browser warning/error logs were empty. The operational
live view showed the new composition without a service restart or new agent work.

## Foreground scale tuning (2026-10-14)

Hub follow-up: the habitat itself is another 20% larger than the first scale
tuning below (1.38 times its native logical size). Its ground anchor stays fixed;
the approach follows the larger airlock and the sensor station moves to the left
flank. The hologram and astronaut sizes are retained. All **26 lunar checks**
passed, generated assets reproduced exactly, syntax/diff checks passed, and the
operational browser showed the larger Hub with no warning/error logs.

The Hub, attached console and holographic platform are 15% larger; astronauts are
20% larger while retaining relative distance scaling. Uniform transforms keep
native sprite proportions, contact shadows and crew stations aligned. The
platform has slightly more horizontal room, paths follow the enlarged footprints,
labels fit available spacing, and resting anchors and yielding distances account
for the larger crew. The shared request beacon follows the Hub's current roof.

The full suite passed **356 tests**, including all-frame work/attention/label
clearance across 124 synthetic agents, station migration and obstacle-safe rest
routes. All **35 JavaScript/CJS files** passed syntax checks and generated assets
rebuilt identically. A read-only browser fixture showed 31 working astronauts,
then a completed crew with an explicit request, without browser warnings/errors.
The operational live tab displayed the larger assets and crew. No service
restart or agent instructions were needed; raster artwork was unchanged.

## Foreground Hub and holographic platform (2026-10-14)

The Hub and its adjacent console now occupy the lower-left foreground. The
holographic platform sits lower toward the center, with the dish behind them.
Area offsets move their scenery, support shadows and crew positions together;
the paths approach the new footprints around the structures. Saved station IDs,
manual preferences, suit identities and the distant greenhouse/rover remain.
This supersedes the position-preservation notes in the earlier audit below.

The full suite passed **356 tests**, including all-frame crew/attention clearance,
work/home separation, connected routes, migration and obstacle-safe rest routes.
All **34 JavaScript/CJS files** passed syntax checks; scene/styles rebuilt byte
for byte. A read-only browser fixture displayed all 31 crew positions without
overlap. Its 40 requests were GET-only and its store remained unchanged. The
operational live tab displayed the new foreground composition with no browser
warnings/errors. No service restart, new agent instruction or permission change
was needed. The unshipped historical placement fixture keeps its old composition
separately from the live layout.

## Perspective and ground-contact audit (2026-10-14)

The apparent scale mismatch came from depth cues and ground contact. The new
sprites already retained their native aspect ratios. Tiny rounding differences
in the original habitat and console heights are now removed as well.

| Finding | Correction |
| --- | --- |
| Small greenhouse and rover occupied foreground positions beside much larger nearby structures | Move both behind the habitat into a distant service row; keep their apparent size close to the previous size and scale their station crew to 65% |
| One oval shadow used the padded image bottom, missing visible supports at different heights | Measure support contacts from each sprite silhouette; draw small contact shadows beneath all scenery and crew |
| Sprite height rounding introduced minor native-aspect differences | Derive both dimensions from native logical geometry with one uniform scale |

The garage and communications dish were repositioned to balance the foreground.
The original five structure positions, first sixteen crew indices and original
three path segments remain; connected branches follow the moved areas. This is
an authored 2D depth arrangement, not a physical camera calibration. Raster art
was not edited.

The full suite passed **354 tests**, including native image aspect ratios,
support-shadow contact with opaque pixels, far-site crew scale, connected paths
and all-frame crew clearance across 124 synthetic agents. All **34 JavaScript/CJS
files** passed syntax checks; generated scene/styles rebuilt byte for byte and
`git diff --check` passed.

A separate read-only browser fixture displayed 31 astronauts at all ten work
areas. Greenhouse and rover assignments persisted after reload and returned to
Automatic. Its 73 requests were GET-only, all five expansion sprites loaded,
warning/error logs were empty, and its operational store remained unchanged at
shutdown. The operational live tab also displayed the new placement and contact
shadows while an actual agent continued working. No service restart, agent
instruction, session change or operational write was made for this audit.

## Expansion artwork in the live shared base (2026-10-14)

Framing follow-up: the live canvas now uses a 16:9 logical frame and uniform
terrain scaling, cropping the unused foreground instead of stretching artwork.
The map can use more horizontal space. Home includes the lowest crew positions;
pan, zoom, hit testing and display scaling share the new logical dimensions.
The 22 lunar checks passed, scene/styles rebuilt identically, and the operational
browser verified all ten work areas, astronaut hit selection, zoom and Home with
no warning/error logs. Agent stations and path geometry were unchanged.

The live map now renders the rover garage, greenhouse, communications dish,
launch pad and parked utility rover alongside the five original structures.
The original placements and three paths remain unchanged; new branches connect
every expansion area to the same path network. All ten work areas appear in
Work at and support three separated positions with distinct existing work poses.
Automatic remains the default and recognizes descriptive cues for the new areas.

- **352 tests passed**, including 124 synthetic agents across four 31-position
  crew pages, cross-project sharing, ten manual choices, Automatic reset,
  overflow, continuation persistence, all-frame crew/attention/label clearance,
  unchanged original geometry, connected paths and exact imported sprite hashes.
- Version-4 browser registries migrate ten- and sixteen-slot layouts while
  retaining original station indices, display pages, suit colors, manual choices
  and remembered Automatic positions. No execution limit was introduced.
- All **31 JavaScript/CJS files** and Python sources passed syntax checks.
  Generated scene/styles reproduce byte for byte. Existing raster files were
  reused unchanged. The five new runtime PNG routes require authentication;
  pack sources, masters, manifests and preview pages remain outside the runtime
  asset allowlist.
- The isolated read-only browser fixture exercised all five new choices,
  persistence after reload, Automatic reset and four astronauts sharing the
  rover across two crew pages. A full 31-agent scene showed three positions at
  each work area. It used **140 GET requests**, loaded all five new sprites and
  stopped with its operational store unchanged. Browser warning/error logs were
  empty.
- The operational service was refreshed while idle at the same loopback address
  to activate its new asset routes. Project, task, job, configuration and session
  records were compared before/after and remained unchanged; CLI readiness was
  restored. The live browser displayed all ten structures and connecting paths.
  Assigning an existing astronaut to the garage and returning to Automatic
  worked. Both actual agents retained Automatic, their original stations and
  saved results. No agent was launched or sent instructions. Browser logs were
  empty. The parked rover and work poses are graphical illustrations.

## Projects panel and expansion artwork delivery (2026-10-14)

The Projects panel shows compact names, vision previews and current agent status.
Each project presents current agents and one latest result per persistent agent;
Earlier runs and Project context retain older results and the full owner context.
Returning from an agent/result restores disclosure state, focus and reading
position. Pending requests remain visible; project rendering does not mutate
operational records.

- **349 tests passed**. Project regressions cover current agent identity,
  latest/earlier result grouping, retained vision and history, references,
  records, conversations and findings, pending/sending responses, simulation
  labels and relevant update signatures.
- All **30 JavaScript/CJS files**, the standalone artwork preview script and
  Python sources passed syntax checks. Generated scene/styles rebuild byte for
  byte; whitespace checks passed.
- The operational browser showed both existing projects and finished agents.
  The SP-8072 project displayed one latest result and eight earlier results;
  its full vision remained in Project context. Opening a result and returning
  retained expanded sections and restored focus. Back to Projects worked.
  Warning/error logs were empty, and the browser returned to All projects in
  the live view. No agents, instructions or operational records were changed.
- The separate five-sprite expansion pack passed its acceptance script in an
  isolated copy: transparency, margins, scale, anchors, source hashes, rover
  frame registration, emission layers, 64-frame/eight-second motion and review
  placement. Display-sprite hashes and unchanged base-reference hashes also
  matched. The contact sheet and placement preview were inspected visually.
  These are future assets and illustrative previews, not live map integration.

## Start agents refinements (2026-10-14)

The existing single-panel launch flow now shows the selected project's folder,
with its full path expandable. Optional project/agent names are collapsed, agent
rows and the Start count stay in sync, and the execution summary and short footer
follow the selected access, networking, duration and checkout choices.

- **350 tests passed**, including a regression for displayed execution choices.
  Focused agent/panel/time-limit/project checks passed 61 tests.
- An isolated browser fixture checked folder switching and selection, collapsed
  custom names, three agents with a middle row removed, retained instructions,
  read-only normalization, networking and separate-checkout notices, and 15-minute
  versus unlimited duration. Blocked launches verified the actual submitted
  payload and an unchanged retry ID without launching any worker.
- At 390×844, the default new-project form's Start button and footer fit on screen
  with no horizontal overflow. Desktop and mobile previews contain synthetic
  fixture data. The operational service and existing browser form were untouched;
  this checks UI behavior, not live provider execution.

## Manual infrastructure choices (2026-10-14)

Every live astronaut card now offers **Work at**, with **Automatic** as the
default and all five existing structures as manual choices. Preferences are
browser-local and follow persistent agents across continuations. Moving an agent
retains its suit and preserves other crew positions. Full structures use existing
positions on another display page, retaining distinct poses and safe spacing.
Returning to Automatic restores the original station when free, otherwise uses
normal allocation without displacing another astronaut.

- The isolated Git delivery snapshot passed **348 tests**; the combined working
  checkout passed 349 during integration. Manual-choice regressions cover all
  five targets, default/reset behavior, reload/continuation
  persistence, identity and suit stability, immutable operational records,
  crowded structures, occupied original stations and invalid saved preferences.
- All **30 JavaScript/CJS files** passed syntax checks. The scene and both styles
  rebuild byte for byte, and the whitespace check passed.
- An isolated read-only browser fixture checked all five selectors, reload and
  Automatic reset. Eight agents assigned to the lander occupied three crew pages.
  Project filtering and the existing conversation panel still worked. The fixture
  used **120 GET requests**, no POST requests or provider calls, and stopped with
  its operational store unchanged. Browser warning/error logs were empty.
- The operational live app was reconnected and displayed Work at for its two
  existing finished agents, both retaining Automatic and their stations. No real
  agent was launched, stopped or sent instructions; no service restart was needed.
  Its browser warning/error logs were empty. This verifies graphical assignment,
  not agent work or engineering results.

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

## Compact Projects panel (2026-10-14)

The full suite passed **349 tests**. Project presentation checks cover current
agent counts without duplicate earlier turns, one latest saved outcome per agent,
retained full owner vision and history, references, accepted records, conversation
and findings. Questions, decisions and native request states remain distinct;
linked requests are not counted twice and obsolete requests stay in history.
Unrelated project progress does not rebuild the selected project panel. Source
syntax checks and deterministic generated-asset rebuilds passed.

The isolated read-only browser fixture used twelve projects, active and finished
agents, older turns, an open question and a long owner vision. Default views kept
extra detail collapsed. Back to Projects restored the list position exactly;
returning from a saved result retained open history and its reading position.
Incoming results preserved open sections and focus, with anchor shifts below one
pixel. When the focused result became an earlier run, that section opened to keep
the previous result readable. The full vision and both saved vision revisions
remained available. Questions revealed the saved records without submitting them.

At 390 by 844, the project list and project view had a 390-pixel document/drawer
and no horizontal overflow. Temporary viewport overrides were reset. Fixture
interactions used GET requests only; no worker or model was launched. Chrome
blocked the operational tab reload during that initial fixture QA. The delivery
check above subsequently verified the live service. The running service was not
restarted.
