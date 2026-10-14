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
not live provider reliability or Windows process behavior. Current screenshots
show fixture data. No new frame-by-frame live motion recording was made; earlier
motion GIFs demonstrate scripted/shared animation only.

Two minutes of activity silence means stale, not proof that a process stopped.
The client has no independent external-agent inventory, measured progress or token
usage. Visual slots remain browser-local. Raster assets were preserved unchanged
by this workspace integration.
