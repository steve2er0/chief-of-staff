# Chief of Staff

A local workspace for turning your vision into ongoing projects, choosing what
to delegate, and reviewing the results. Built with the Python standard library,
SQLite, and plain HTML/CSS/JavaScript. No pip or npm install is required for the app.

## Start

Requires Python 3.9 or newer; Python 3.11+ is recommended.

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

## Work with your CoS

1. **New project:** describe your vision and optionally name the project.
   Details such as priority, target date, working folder and references are optional.
2. **Conversation:** build on your idea with a short **Where we are** note and one
   **Suggested next step**. Detailed planning stays behind **Delegate work**.
3. **Delegate work:** prepare one agent task from your vision and conversation.
   The worker handles its research, implementation and checks inside that task.
   Use **Detailed planning → Split into separate assignments** when you want
   independent responsibilities.
4. **Review the brief:** edit the short goal and completion criteria. Detailed
   instructions, output paths and captured context are expandable. Review
   permissions, approve the assignment, then explicitly launch the agent.
5. **Follow progress and review results:** see the latest meaningful agent update,
   elapsed time and last activity. Returned work shows changes, reported checks,
   limits, what needs your judgment and a suggested next step. Inspect output
   snapshots, record useful partial findings,
   request revisions or accept results. Completing a linked work piece is a
   separate choice. Other pieces can stay with you, wait on dependencies or be deferred.

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
previews of this same queue. Answering a question records project context; it does
not steer a running agent or clear an external tool permission.

For stopped work, open the handoff, enter what you checked or what should happen
next, and choose **Resume saved work**. This prepares a continuation brief with the
previous report and output metadata. Review, approve and launch it. Compatible
Codex work resumes the exact captured session; a changed folder or CLI/model needs
a fresh session. Repeated continuations retain the original instructions without
accumulating retry notes. Interrupted processes still require cleanup confirmation.

Settings supports **1–6 concurrent jobs**, including CoS calls. Folder locks still
serialize overlapping writers. Independent CLI processes are not managed by CoS.

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
allowlist. Read-only calls keep command networking disabled. Browser tools retain
separate permission checks; CoS cannot grant their origin access or relay an
interactive CLI approval. To resume a research-blocked task, draft a revision,
select research access, approve the new brief, then launch.

The assignment brief also has a **Time limit** choice: the workspace default or
**No time limit**. This choice is captured in approval and retained on revisions.
No time limit disables the elapsed-time cutoff for that worker; pause/cancel,
process cleanup, sandbox permissions, output bounds and final-result checks still
apply. Other assignments and read-only coordinator calls use the workspace default.

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
operations; this app does not provide an interactive approval relay. The installed
CLI, trusted configuration, plugins and platform policy remain part of the boundary.
Read-only limits writes, not necessarily which files a model can read.

Directory locks coordinate assignments launched by this app, including overlapping
readers/writers. They cannot coordinate unrelated terminals, editors or other apps.
Pause/cancel requests process-tree cleanup and preserves history. Partial edits
from a failed or cancelled write task are not rolled back. After a crash, uncertain
active calls retain recovery locks until you confirm the old processes stopped.
Real work queued across restart requires readiness checks and renewed approval.

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
