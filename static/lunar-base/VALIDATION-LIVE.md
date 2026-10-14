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
