# Chief of Staff

A local Lunar Base workspace for starting multiple CLI agents, following their
progress, replying, and collecting their results. Built with the Python standard library,
SQLite, and plain HTML/CSS/JavaScript. No pip or npm install is required for the app.

## Start

Requires Python 3.9 or newer; Python 3.11+ is recommended.

On macOS, install a double-click app once:

```sh
python3 -B desktop/install_macos.py
```

This creates **Chief of Staff.app** in your Applications folder and a Desktop icon.
Double-click the icon to open the live workspace in your default browser. The server
runs in the background, so no terminal window is needed. Reopening the icon reuses
the existing server and saved projects. Closing the browser leaves agents running.
The launcher selects Codex CLI mode and uses your installed CLI and existing login;
initial model settings follow your CLI preferences. Existing selected app models
and running task permissions remain unchanged. No agent starts just by opening an
empty workspace. If you move the repository, run the installer again.

On macOS or Linux:

```sh
git clone https://github.com/steve2er0/chief-of-staff.git
cd chief-of-staff
python3 -B app.py --port 8876
```

On Windows, in PowerShell:

```powershell
git clone https://github.com/steve2er0/chief-of-staff.git
Set-Location chief-of-staff
py -3 -B .\app.py --port 8876
```

If `py` is unavailable, use `python`. The app opens a private local browser URL.
Keep the terminal open while working; Ctrl+C stops the service and its workers.
The default port is 8765; choose a different port if one is occupied.

A fresh checkout starts empty in **simulated mode**, with no account or model
calls. State lives in the ignored `runtime/` folder by default. To store it
elsewhere, pass `--data-dir /path/to/local-state` or, on Windows,
`--data-dir "$env:LOCALAPPDATA\ChiefOfStaff"`. Use `--no-browser` to print the
launch URL without opening a browser. Only one service can own a data folder.

## Manage agents

The previous demo URLs also open the live workspace. Results, project context,
questions and settings are panels; the map stays in place.


The **live Lunar Base** is the starting view. Each project has a complete base:
habitat, exterior console, lander, model platform, engine test stand and connecting
paths. Each agent keeps one astronaut across its turns. Click **Start agents**, choose an
existing project or a working folder, and write an instruction. Add another
agent row for each separate responsibility, then click **Start agents** once.
No framing proposal, work map, acceptance criteria form, or separate approval
step is required. Starting records your instructions and execution choices.

Select an astronaut to open its side panel with the latest update, elapsed time
and status. Use its conversation to send instructions while it runs, answer a question,
or **Reply & continue** after it finishes. Follow-ups keep the exact session,
working folder, model and execution permissions. Tool permissions are handled
in the same conversation when the CLI requests them. A saved result does not
need to be accepted before you start another agent or send a follow-up.

**Results** opens a drawer over the same map and collects every returned report and captured file, including partial
work and earlier turns. Changes, reported checks and limitations are shown
up front; raw reports, files and detailed activity are expandable. Acceptance
is an optional way to record your judgment, not an execution gate.

Codex agents use the CLI's local **app-server** protocol for two-way communication.
On older CLIs without app-server, replies queue for the next exact-session turn;
the conversation labels that behavior. Queued, delivered, failed and uncertain
message receipts are distinct. A reply with an uncertain receipt is never
silently resent. No additional login, API key or provider configuration is installed.

Execution options include sandboxed or YOLO access, command networking and a
time limit. Direct and planned agents run until finished or stopped by default. The selected
policy is shown before start and remains fixed for follow-ups. Changing workspace
defaults affects new starts. Live tool permission requests require your actual
response; ordinary replies do not broaden execution permissions.

Editable agents work directly in the chosen project folder by default, so the
app or standalone file you open there contains their changes. Agents writing
overlapping folders run one at a time; agents in different projects can run concurrently.
Settings can change this default, and each direct start can select separate
checkouts for Git projects when parallel edits in the same project are useful.
Those worktrees include current tracked changes, untracked inputs and explicitly
selected ignored references. Preparation runs in the background with a visible
Preparing status; replies and Stop remain available. Other ignored files are excluded.
Worktree edits stay in that checkout until applied to the original; no merge or
commit is automatic. Results show the checkout and branch, and worktrees are retained.
Existing agents continue in their captured folder when defaults change.
Repositories without commits and submodule repositories can use the project folder.
Independent CLI processes and editors are outside the app's directory locks.

Projects retain vision, context, conversation and continuity. Briefings, work maps
and detailed planning remain available when useful. Dependencies are advisory;
deferred work pieces stay deferred. See [agent management](docs/AGENT-MANAGER.md)
for transport, recovery and validation details.

With **Codex mode** configured, creating a project automatically starts a
read-only setup review of the vision, working folder and selected references.
The project saves immediately while the CoS gets oriented. Empty folders are valid.
The review returns tentative understanding and a useful next step; it does not
create assignments or approve decisions. Busy reviews wait and failed reviews
can be retried without recreating the project.

The CoS builds on what you say and asks a question only when a meaningful
owner decision would change the next step. Suggestions remain separate from
your original vision and agreed direction until you choose to adopt them.
Local guidance is labeled **not AI** and does not claim to interpret or inspect
project work using a model.

Sending shows **Sending…**, then a **Sent to CoS** receipt. A persistent
**CoS is thinking…** bubble stays until a reply arrives, fails or is stopped.
You can compose your next message while waiting; incoming replies preserve
its text, focus and cursor. Failed sends keep the draft, and uncertain retries
reuse the same request ID. Local notes are labeled **Saved locally**.

**Your briefing** brings together project priorities, continuity, next steps,
questions and returned results. Optional Codex focus advice remains a recommendation.
Briefings use the computer's local clock and run only while the service is running.
There are no email or desktop notifications, missed-slot catch-up, or work while
closed or asleep.

**Needs you** is the shared attention queue for assignment approvals and launches,
open questions and proposed decisions, stopped-work handoffs and returned results.
Filter it by Approvals, Handoffs or Reviews. Your briefing and Agent activity show
previews of this same queue. Answering a question records project context; linked responses can continue their agent. Tool permission requests are separate.

For stopped work, open the agent and choose **Reply & continue**. Its saved
session and files are reused. If no session was captured, choose **Start a fresh
session**. After a crash, uncertain processes still require cleanup confirmation.

Settings supports any nonnegative concurrency limit; **0 means unlimited**.
Coordinator calls count toward the limit. Shared-folder locks serialize
conflicting writers; separate worktrees allow agents to run concurrently.

## Returned work and handoffs

CoS retains the original agent report and captures valid files individually.
There is no delivery file-count cap or fixed per-file snapshot size cap; copying
and downloads stream from disk. One missing file, directory entry or storage
problem produces **What needs fixing** with the exact path and recovery action.
The report and other valid snapshots remain available. Incomplete capture is labeled with the affected files; valid snapshots and
the original report remain available, and **Reply & continue** can fix the handoff.
Existing unchanged files are allowed for validation-only work and labeled as such.

Long runs have no cumulative output or event-count cutoff. Large records spill to
disk with bounded live previews and full request/report downloads. Questions remain
answerable and permission replies use the complete requested scope. Human review still determines whether
reported checks and outputs satisfy the assignment.

## Files and references

In **Project details**, **Choose folder…** selects the working directory.
**Reference files → Choose files…** opens a native multiple-file chooser and
works before choosing a directory. Names and sizes appear in the draft; creating
or saving the project stores read-only input copies. Originals remain unchanged.
Copies are retained for project and approved-assignment history.

Expand **Files and folders from the working directory** to select paths within
that directory. Folder references store paths without recursively importing
contents. Individual files are limited to 8 MiB, with at most 30 references in total.
A Word `.docx` import can supply vision or log text for you to review before saving.
The parser does not extract archives, follow external relationships or run macros.

## Connect Codex CLI

Use an existing installed Codex CLI and its existing login/provider configuration.
This app does not install the CLI, create keys, run login/logout, or rewrite global
Codex configuration. In **Settings**:

- Select **Codex CLI** mode when you intend real model calls.
- Set a native executable path or name. Shell wrappers are refused.
- Set a model identifier supported by your account or organization. The default
  model string is an unverified placeholder; replace it before using real calls.
- Run **Check CLI capabilities** after a service restart or CLI update. This checks
  version/help only, not authentication, model availability or sandbox enforcement.
  Automatic setup reviews perform this readiness check when needed.
- Choose a real project working folder outside app source/storage before launching
  delegated work. Read-only conversation can start before choosing one.

For npm installations that expose a shell wrapper, configure the native `node`
(or `node.exe`) executable and the installed `@openai/codex/bin/codex.js` entrypoint
separately. In PowerShell, `Get-Command codex -All` and `Get-Command node` can help
locate an existing installation. Enter paths, not command lines or arbitrary flags.

Model-backed conversation, setup review, decomposition and result review are
read-only calls. Delegated workers use the approved `read-only` or `workspace-write`
access. These calls use your CLI's configured provider and account, and its data
handling and usage policies apply.

## Approval, recovery and local storage

Plans freeze their context and permissions. Editing a plan or changing relevant
project/settings data invalidates approval. Repeated actions use persisted request
UUIDs, and repeated launch of the same plan does not create duplicate assignments.
A worker's completion is a claim for your review; it cannot accept its own result.
Output snapshots are checked for integrity before acceptance. Those checks do not
establish semantic correctness or engineering validity.

Each editable assignment includes **Allow public web research & downloads**, off
by default. Selecting it and approving the brief enables outbound command network
access for that worker, including an exact-session resume. It does not change
other assignments or global CLI settings. Downloads stay in the project folder;
public-source-only use and no private uploads are worker instructions, not a domain
allowlist. Read-only coordinator calls keep command networking disabled. Browser tools retain
separate permission checks. App-server tool approval and question requests are
relayed to the agent conversation; only an explicit response grants a requested tool action.

New agent drafts default to **No time limit**. A finite limit can still be selected;
the configured finite limit initially remains 900 seconds (15 minutes). The choice
is captured with the assignment and retained on revisions.
No time limit disables the elapsed-time cutoff for that worker; pause/cancel,
process cleanup, sandbox permissions, output bounds and final-result checks still
apply. Read-only coordinator calls retain the configured finite limit.

The adapter passes argument arrays with `shell=False` and sends prompts through stdin.
Assignments default to sandboxed `read-only` or `workspace-write` execution with the
user approval reviewer. Editable assignments also offer **YOLO · --yolo**: the CLI's
`--dangerously-bypass-approvals-and-sandbox` flag removes command approval prompts
and CLI sandboxing, including its file/network restrictions. It is assignment-scoped,
included in approval, capability-checked for new/resumed calls, and retained on
continuations. Read-only assignments cannot select it. Browser permissions remain
separate, and the assigned scope still applies. Existing tasks stay unchanged;
switching a draft's policy requires approval again. No automatic reviewer or
arbitrary flags are enabled. Sandboxed headless CLI builds may reject approval-required
operations; legacy exec runs do not provide an interactive approval relay; managed app-server agents do. The installed
CLI, trusted configuration, plugins and platform policy remain part of the boundary.
Read-only limits writes, not necessarily which files a model can read.

Directory locks coordinate assignments launched by this app, including overlapping
readers/writers. They cannot coordinate unrelated terminals, editors or other apps.
Pause/cancel requests process-tree cleanup and preserves history. Partial edits
from a failed or cancelled write task are not rolled back. After a crash, uncertain
active calls retain recovery locks until you confirm the old processes stopped.
Real work queued across restart is paused for an explicit continuation;
managed agents automatically check CLI readiness without another plan approval.

The service binds only `127.0.0.1`. Its launch URL creates a private HttpOnly,
SameSite cookie; mutations require the local origin and a CSRF token. Keep the URL
private. SQLite records, uploaded references, logs and output snapshots are
**unencrypted local data**. Keep state on an access-controlled disk and out of
public repositories. These browser controls do not protect against a hostile
program already running as the same local user.

## Validate and package

```sh
python3 -B -m unittest discover -s tests -v
node --check static/app.js
node --check static/workspace.js
node --check static/agents.js
node --check static/conversation-feedback.js
node --check static/path-picker.js
node --check static/reference-files.js
```

Node is only needed for JavaScript syntax checks and Node-based Codex installations.
The automated suite uses synthetic inputs and injected model mocks; it makes no
paid model calls. See [validation](docs/VALIDATION.md) for scope and platform limits,
[architecture](docs/ARCHITECTURE.md) for modules, and
[project workflow](docs/PROJECT-WORKFLOW.md) for the record/approval model.

`python3 -B package_source.py` creates a source ZIP and SHA-256 file in the parent
directory, using an explicit code/test/documentation allowlist. Runtime state,
credentials, local screenshots and private evidence are excluded. A transferred
checkout starts empty; do not copy credentials or machine-specific state as part
of the source. Deliberate state migration needs secure transfer, remapped paths
and CLI checks on the destination computer. Native Windows operation still needs
validation on that computer.
