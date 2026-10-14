# Agent management

The live Lunar Base is the primary workspace. Start agents, open an astronaut’s
conversation, and collect results in drawers without replacing the map. The primary
workflow is **Start agents → progress/conversation → returned work →
reply and continue**. Projects, briefings, work maps and formal result acceptance
are optional supporting workflows.

## Starts and continuation

`POST /api/start-agents` accepts a project ID or a new local folder plus one or
more instructions. It normalizes execution choices, captures current project
context, records the owner start and creates queued agents atomically. The existing
plan/approval records remain as provenance; they do not require separate UI actions.
HTTP request UUIDs and internal start/reply records prevent duplicate launches.
Reusing a request ID with different input is rejected.

`POST /api/agent-reply` sends a follow-up to a running session, appends instructions
to a queued start, or directly queues a continuation of a finished/stopped agent.
Each run is a task record. `agent_id` groups those records into one conversation;
`parent_task_id` links successive turns. Previous tasks become `superseded`, but
their original reports and snapshots remain in the Results view. Result acceptance
does not gate new starts or continuation.

Continuations preserve the task's captured model, CLI, working folder, session
and execution policy. Workspace default changes affect new starts. Starting a
fresh session is explicit. After a crash, uncertain running processes retain a
recovery lock until the owner confirms cleanup. Queued real work pauses on restart;
the owner can continue it without preparing or approving another brief.

Work-map dependencies are advisory. Foreign-project links, duplicate active work
on the same linked piece, and deferred/completed piece selection remain checked.
General agents can run independently in the same project. Notes and project
progress no longer force a second approval when the owner clicks Start on a brief.

## Live transport

`cos/live_agent.py` uses the installed CLI's local app-server JSON-RPC protocol
over stdin/stdout, with the existing account and provider configuration. The
adapter checks `app-server --help` during CLI preflight. Each run owns its child
process, thread ID, turn ID, request queue and process cleanup.

Initialization is followed by `thread/start` or exact `thread/resume` and then
`turn/start`. A running follow-up uses `turn/steer` with the expected turn ID.
Server question, command, file-change, permission and MCP elicitation requests
are displayed in that agent's conversation. `POST /api/agent-response` validates
the exact active request and sends the response to that process. Unsupported
requests receive a protocol error rather than automatic permission.

Ordinary replies cannot change model, folder, sandbox or network policy. Actual
permission requests are separately presented and require an owner response.
Command/file approvals can be allowed once, allowed for the session, or declined.
Permission-profile grants are limited to the requested profile and current turn.

Messages retain distinct pending, sending, delivered, queued-for-next-turn,
uncertain and failed receipts. A reply that the server explicitly rejects because
its turn finished is carried to the next turn. A message written to the transport
without an acceptance receipt is uncertain and never silently resent. An unsent
message arriving during shutdown of a finished run is queued for the next turn.
Pause/cancel still stops the process tree and retains partial files.

Older CLIs without app-server use the existing exec adapter. Follow-ups are
explicitly labeled as queued for the next turn; they are not represented as live
steering. Coordinator calls continue to use the existing read-only exec contract.

Protocol reference: [Codex App Server](https://learn.chatgpt.com/docs/app-server).

## Workspaces and results

Git write agents default to separate worktrees on `codex/cos-…` branches. They
start from HEAD with current tracked changes and untracked, non-ignored inputs
copied into each checkout. No staging, commit, reset or merge occurs in the source.
Untracked symlinks and initialized-submodule repositories require shared-folder
execution rather than an incomplete copy. Worktrees and edits remain available;
the UI shows their paths and branches. There is no automatic integration or cleanup.

Non-Git folders and repositories without commits use the shared folder. Overlapping
writers/readers still serialize through the existing directory locks, while
separate worktrees and independent folders can run concurrently. These locks do
not cover external terminals and editors.

Prose is a valid managed-agent result. The protocol determines whether the turn
completed; report-format errors do not erase useful work. Agent-declared paths
and file-change events feed the existing containment-checked snapshot capture.
Individual missing or unsafe artifacts remain visible limitations; other files
and the original report are retained. Snapshot hashes are retained and checked for optional acceptance. Reported tests remain agent claims, not independent
verification.

## Validation boundary

`tests/test_agent_manager.py` exercises starts, retries, preserved policies,
continuation, crash locks, shared-folder serialization, worktrees with dirty
inputs, authenticated HTTP routes, and a local subprocess protocol fixture for
steering, questions, approvals, cancellation and session mismatch. The fixture
uses real pipes but no Codex model or paid calls. Existing persistence, artifact,
HTTP security and coordinator tests continue to apply. Native provider/model
behavior and Windows process handling require environment-specific validation.

## Live workspace projection

`static/agent-model.js` selects the current turn by persistent `agent_id` and
`parent_task_id`, and collects all returned turns by completion time. Both the
agent controls and Lunar projection use this shared model. Astronaut slots use
`task:<agent_id>` so a continuation preserves position, suit and selection.
Queued and simulated managed agents appear as stationary, explicitly labeled
astronauts. Animation still requires confirmed Codex execution and fresh activity.
Only active or recovery-locked coordinator calls appear as additional crew.

The application owns the authenticated state poll and POST controls. Its scene
instance receives snapshots and connection failures; opening or refreshing a panel
does not remount the canvas or reset the camera. Native questions and permissions
use the same exact-request forms as the agent manager. Pending requests on stopped
turns and project questions linked to superseded/cancelled turns do not leave
question beacons behind. Finished managed results are available without acceptance.

`/` and `/lunar-base/` serve the same workspace, including old `?mode=` URLs.
Scripted attention, workshop, placement and original demo modules remain local
source fixtures and are excluded from product navigation and the scene bundle.
Rebuild the bundle and scoped styles with `python3 static/lunar-base/source/build_scene.py`.
