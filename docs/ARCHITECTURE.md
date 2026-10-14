# Architecture and maintenance

The server and UI use no third-party runtime libraries.

| File | Responsibility |
| --- | --- |
| `app.py` | Local launcher, CLI arguments, browser opening and graceful stop |
| `cos/server.py` | Loopback HTTP, cookie/CSRF/origin/Host checks, request UUID idempotency and bounded JSON requests |
| `cos/store.py` | SQLite WAL, durable JSON records, atomic read/modify/write lock, audit history and exclusive service-instance lock |
| `cos/service.py` | Projects/context, proposals, approval digest, task lifecycle, scheduling, directory locks, artifact validation, simulation and coordinator requests |
| `cos/agents.py` | Shared managed starts, persistent identity, asynchronous worktree preparation and continuation |
| `cos/wire.py` | Disk-backed protocol records, incremental JSON/text capture and exact permission reply streaming |
| `cos/live_agent.py` | Task-scoped app-server transport, live steering, request relay and delivery receipts |
| `static/agents.js` | Primary agent board, start composer, session conversation and shared Results view |
| `cos/portfolio.py` | Vision/history, discussion proposals, work maps and dependencies, selective delegation, partial findings, continuity and portfolio advice |
| `cos/attention.py` | Read-only attention queue derived from plans, tasks, project records and the latest coordinator jobs |
| `cos/adapter.py` | Capability help preflight, fixed argv, bounded JSONL event parsing, exact session routing and process-tree cleanup |
| `cos/safety.py` | Text/path bounds, relative file containment and read-only DOCX parsing |
| `cos/filesystem.py` | Authenticated picker directory metadata, bounded name search and root-limited reference navigation |
| `cos/intake.py` | Durable automatic read-only setup review, scheduler dispatch, retries and recovery |
| `cos/references.py` | Browser-selected input copies, portable metadata, integrity checks and project binding |
| `static/` | Escaped DOM rendering, polling board, forms, result review and batch decision resolution |
| `static/workspace.js` | Briefing home, project conversation/brief, editable decomposition, work-map selection, review inbox and focus choices |
| `static/attention.js` | Shared attention queue, direct question resolution and reviewed continuation handoffs |
| `static/path-picker.js` | Working-folder selection, multiple file/folder references and cancellation without changing the project draft |
| `static/conversation-feedback.js` | Confirmed message receipts, persistent agent status, safe send retries and draft-preserving reply updates |
| `static/followup-suggestions.js`, `static/composer-suggestions.js` | Conservative local follow-up drafts, stale prediction rejection and draft-only composer acceptance; see [behavior and limits](FOLLOWUP-SUGGESTIONS.md) |
| `static/reference-files.js` | Native multiple-file selection, draft state, save-time copies and cleanup of unsaved uploads |
| `tests/test_app.py` | Synthetic safety, persistence, state-machine, scheduling, adapter and loopback HTTP tests |
| `package_source.py` | Transfer archive creation through a source allowlist |

The SQLite `objects` table stores typed records (`project`, `plan`, `task`, `job`, `config`, `briefing`, `capabilities`, `request`, `message`, `proposal`, `work_item`, `finding`, `portfolio`, `focus_advice`). Upserts preserve record order. The `audit` table keeps action provenance. All transitions use a reentrant transaction lock; application worker threads do not share a shell.

Project vision and its user-authored revisions are separate from CoS proposals and the adopted brief. Proposals carry their source and project version; adoption refuses stale context. Work-item dependencies form a validated, advisory graph within one project. Selection creates linked draft specs with stable identities; editing/removing specs preserves the correct internal work-item/session associations. An assignment result does not complete its work item unless the reviewer explicitly chooses that consequence.

Discussion, decomposition and portfolio model calls use read-only coordinator jobs, bounded JSON contracts and existing concurrency/cancellation controls. All remain explicit real-call actions. The loopback state snapshot derives local recommendations without model calls. Optional Codex portfolio advice uses a frozen portfolio snapshot; project versions, task lifecycle state, overall vision and time budget determine whether the advice is still current.

Plans are mutable drafts with increasing revisions. Approval hashes normalized assignment specs, the project context snapshot and execution settings. Launch rechecks the digest and current project version atomically before creating task records. Later assignments consume current durable project context; running tasks keep the exact context snapshot that was approved.

Task lifecycle:

```text
draft plan -> approved plan -> explicit launch -> queued -> running
running -> ready_for_review -> accepted
running -> failed / blocked
queued / running -> paused / cancelled
crash during work -> interrupted + recovery lock
managed-agent follow-up -> superseded + directly queued next turn
legacy explicit revision -> superseded + new draft plan
```

Only the service scheduler starts queued workers. It counts coordinator calls against concurrency and refuses overlapping read/write folder access. A persistent interrupted-work lock covers the uncertain state after a crash. An exclusive OS file lock prevents two app instances from opening the same data folder.

Concurrency accepts any nonnegative limit; 0 means unlimited. Attention is a projection, not a second lifecycle:
approving, launching, answering, accepting or preparing a continuation removes or
replaces the corresponding item. Superseded tasks and older retried coordinator
failures do not duplicate attention. Dismissing a finished CoS failure retains its
history. Cancelled assignments can be continued from task details but do not demand
attention automatically.

Resume and revision both create a new draft with immutable `resume_context` from
the predecessor and editable `continuation_note`. The original purpose stays
stable. Approval includes these fields. The worker receives them only after explicit
launch. Captured session identity remains code-owned; folder/CLI changes require a
fresh session. A failed recovery request does not remove the process cleanup lock.

The per-assignment `execution_policy` defaults to `sandboxed`. `yolo` requires
workspace-write and an explicit owner start with that execution choice. The adapter uses the CLI's advertised
`--dangerously-bypass-approvals-and-sandbox` flag on exec or exec resume, without
contradictory sandbox/approval/network overrides. CLI file/network restrictions are
removed; browser tool permissions and CoS scheduling, lifecycle and artifact checks
remain independent. Coordinator calls always use sandboxed read-only execution.

Codex prompts are stdin data. CLI options come from a fixed code-owned list; no free-form command or flag field exists. Each real call uses its approved cwd/model/sandbox. A worker cannot mark itself accepted. Coordinator/legacy responses use a final JSON contract. Managed-agent responses may be prose; successful transport turns and exact captured sessions are still required. Write task deliverables must resolve to regular files within cwd. Capture checks each entry independently: invalid entries produce actionable handoff issues while valid files and the original report are retained. Unchanged existing deliverables may support a validation-only continuation; they do not prove implementation or successful checks. Snapshots, not active project files, are downloaded and accepted. Hash checks detect snapshot tampering; acceptance criteria still need human judgment.

`research_access` is a strictly boolean, per-spec field defaulting to false. It is
included in the exact approval payload and copied to the task. Only an approved
workspace-write worker can enable `sandbox_workspace_write.network_access` for
its invocation; exact-session resumes receive the same override. No configuration
file is changed. Read-only coordinators remain offline for command networking.
The network grant is not a domain allowlist; public-source/no-upload limits are
prompt instructions. Browser tools and other connectors retain independent
permission enforcement. A denial remains blocked; no automatic reviewer is enabled.

An approved spec's `time_limit` is `default` or `none`. New drafts default to `none`; explicit finite choices remain available.
The choice participates in the frozen approval digest. At launch, `none` maps to
`timeout_seconds=0` in that task's config snapshot, which disables only the
adapter's wall-clock deadline. Workspace settings retain their bounded default;
coordinator calls do not inherit the choice. Revisions keep it and require fresh
approval. Cancellation, bounded capture buffering, session checks and completion validation
remain active without a deadline.

The JSONL reader uses bounded chunks and eight queued records. Large records spill
to task storage; `cos/wire.py` indexes JSON on disk and streams decoded text and
exact permission profiles. Live state contains bounded previews and authenticated
request/report downloads retain full contents. There is no cumulative output or
event-count cutoff. Malformed data, session identity and actual CLI failures remain
checked; managed agents accept prose and coordinators retain strict contracts.

Result capture saves the original agent report before inspecting artifacts. There
is no artifact-count cap or fixed per-file size cap: copies, downloads and integrity
hashes stream in 1 MiB chunks. Available disk space is checked for each file with
5 MiB reserved for report/database storage. A missing, unsafe, directory, changing
or unreadable entry does not hide other valid snapshots. Capture issues leave the
task blocked with a specific correction list, even if the agent claimed completion.
A report download storage error still leaves the text in the task record. Partial
and failed work retains its report and any valid snapshots. Downloads and human
acceptance use saved snapshots; hashes establish integrity, not engineering
validation. A worker cannot accept its own result. Owner-requested handoff recovery requires a stopped current task and its matching captured session. It captures current files in a new output directory, preserves the original report bytes and previous capture metadata, and stays blocked. Supplementary follow-up files are labeled separately from the original report. Follow-up checks retain their source and history, update the correction list, and never accept a result or launch a worker.

Sandboxed headless approval semantics depend on the installed CLI. Current inspected exec source denies approval-required operations for the user reviewer; the adapter never enables automatic review. Windows cancellation uses a Job Object; POSIX uses a separate process group. A crash on POSIX may leave children alive, so recovery asks the user to confirm cleanup instead of blindly killing a stored PID.

The scheduler checks the system-local date/time every 0.4 seconds while running. It persists a `local:YYYY-MM-DD:HH:MM` key for each scheduled snapshot. This gives once-per-wall-time-slot behavior across restarts and repeated DST times. Historical snapshots are read-only; decisions resolve against current project records.

The browser escapes all user/model strings before HTML insertion. The service renders no model HTML or external assets. A launch token establishes a local cookie; each mutation additionally requires exact origin and CSRF headers. Request UUIDs are persisted so network retries can return the same result. This is a single-user local service, not an Internet server or hardened isolation boundary against other programs running as the same OS user.

The path picker uses an authenticated same-origin POST with the existing CSRF
checks. Browsing returns at most 300 names and path metadata, never file contents;
listings are not persisted in request records. Reference navigation stays inside
the chosen working directory and rejects symbolic links and resolved paths
outside that directory. Working-folder links resolve to their real location and
retain existing app-storage/source/home/root exclusions. File and directory
references share containment validation, while artifact outputs still require
bounded files. Selecting paths changes only the draft form. Saving a project
retains the existing active-work restrictions and context/approval invalidation.

Keep future changes small: add genuine state-transition/safety tests for altered behavior, run the synthetic suite, and recheck installed CLI help before adding flags. Do not replace malformed/error states with success, silently accept worker decisions, infer corporate model availability, or broaden permissions to make a test pass.

Browser-selected reference files are separate from working-directory paths. A native
multiple-file input holds file objects in the unsaved form; selecting or cancelling
does not upload anything. Save uploads each bounded file through the private
same-origin API, then binds its UUID, name, size and SHA-256 into the project
transaction. Copies live under app storage, outside agent writable roots.
Unbound copies from a failed save are discarded when the form closes. Removing
a saved reference keeps its copy for prior project/assignment history. Upload
retries reuse their UUID request ID. Duplicate name/content pairs are collapsed
when saving; equal names with different bytes remain separate references.

Canonical project/approved-plan records contain portable reference metadata, not
absolute storage paths. Provider prompts resolve that metadata to read-only copy
paths at invocation time. Integrity checks run before coordinator calls, approval,
launch and worker prompts. Changing the selection advances project context and
invalidates earlier launch approval; active work prevents reference changes.
Selecting files never approves or launches assignments. Download endpoints require
the private cookie, verify integrity and force attachment delivery with nosniff.

Conversation sends return the committed user message together with its coordinator
job or local proposal. Delivery metadata links the message to that exact job and
the validated HTTP request UUID. The UI shows Sending before acknowledgement and
Sent only after acknowledgement or a matching persisted receipt. Uncertain retries
reuse the request UUID; a later snapshot can reconcile a lost acknowledgement
without duplicating the conversation call. Local delivery remains labeled local.

Live conversation polling updates the transcript, receipts and notes separately
from the composer, preserving input, focus, cursor and open history. A running
read-only conversation/setup job supplies the animated thinking bubble and Stop
action; terminal states remove it and restore sending. Reduced-motion preferences
disable animation. No assignment approval, launch or acceptance semantics change.

## Primary agent workflow

Direct starts record the owner action and freeze instructions and permissions in
one transaction. `agent_id` groups task records across turns. Replying or
continuing keeps the exact session and execution snapshot without a new approval
brief. Completed results stay available regardless of acceptance. Planning
drafts remain optional; starting one refreshes current background context without
another approval for notes or progress changes.

Managed agents use app-server for live steering and actual question/tool
responses. The exec adapter remains for read-only coordinator calls and legacy
CLIs. Session/turn identities, receipts, process cleanup, HTTP security and
directory locks remain enforced. Separate worktrees allow concurrent Git edits
without weakening shared-folder conflict locks. See [agent management](AGENT-MANAGER.md).

## Live Lunar Base workspace

The authenticated root page mounts one persistent `LunarLiveView` canvas. Agent
conversations, launch forms, results, project context and settings use nonmodal
side panels. Opening panels leaves map selection, camera, positions and polling
intact. The existing task/plan/record deep links open those same panels. Old Lunar
mode URLs serve this workspace; demo code is retained only as source fixtures.

`static/agent-model.js` supplies current agent turns, status labels and complete
result history. The Lunar model uses stable agent IDs for slots and native request
metadata for attention. Managed queued/simulated agents stay visibly stationary;
real motion still requires fresh activity and captured process/session evidence.
Camel-case native tool events and legacy event names share the same work-area
mapping. Snapshot loss freezes last-known state. All control mutations retain the
existing API, CSRF, request UUID, exact-session and workspace conflict checks.
