# Validation

## Automated checks

The current source passes **218 automated tests** using:

```sh
python3 -B -m unittest discover -s tests -q
```

Python source parsing and syntax checks for all six main-interface JavaScript files also pass.
Model subprocesses are mocked in the automated suite; tests use temporary synthetic
projects and do not make paid model calls or require credentials.

| Area | Covered behavior |
| --- | --- |
| Projects | Vision/history persistence, optional context, proposal adoption, stale-proposal rejection, checkpoints and portfolio continuity |
| Delegation | One task by default, short goal and captured conversation, explicit splitting, acyclic dependencies, draft/approval/launch separation, exact approved context, duplicate prevention and linked work pieces |
| Review | Reported checks versus artifact integrity, blocked partial snapshots, review drafts, partial findings, acceptance notes and separate work-item completion |
| Setup review | Automatic read-only orientation, empty folders, busy/writer gates, cancellation, preflight failure, retry, restart persistence and interrupted recovery |
| Message delivery | Exact message/job/request links, local-only receipts, rejection without a false message and idempotent retries |
| Files | File/folder containment, traversal/network path rejection, symlink handling, bounded metadata browsing, file-copy integrity and history retention |
| Word import | ZIP/XML limits, duplicate/entity refusal and no archive extraction or external relationships |
| Progress | Meaningful messages survive tool events and history limits; structured summaries and reported blockers stay distinct from execution state; measured elapsed time freezes at worker end |
| Workers | Success, blocked/failed states, concurrency, directory locks, pause/cancel, recovery and distinct captured sessions |
| CLI adapter | Help preflight, fixed argument construction, schema fallback, exact-ID resume, assignment-scoped research grants and default denial, malformed/error event rejection and cancellation through mocks |
| HTTP/storage | Loopback binding, private session, Host/origin/CSRF checks, safe downloads, SQLite persistence and request UUID deduplication |

## Browser checks

Mac browser QA on isolated synthetic data exercised project intake, conversation,
framing/work-map adoption, selective assignments, separate approval/launch,
simulated result review and dependency handling. Native reference selection worked
before choosing a working folder, persisted after save/reopen, deduplicated repeated
file content and retained originals unchanged.

Message feedback checks verified Sending before acknowledgement, a confirmed Sent
receipt and persistent thinking state. A reply arriving while the next draft had
focus preserved its text, focus and caret. Failed sends retained the draft; failed
or stopped calls cleared thinking. Thinking survived reload. A deliberately lost
confirmation reconciled through the persisted request UUID without another message
or job. Local guidance stayed labeled local. No delegated worker was launched by
conversation or setup review.

The single-task workflow was also checked with isolated synthetic data: a short
editable goal, collapsed detailed instructions, separate approval and launch, one
worker, persistent human updates after 105 tool events, neutral in-flight status reports
while still running, frozen run time after completion, reload persistence, and
changes/checks/limits/judgment/next-step presentation. Review drafts remain intact
through polling and explicit local output checks. These checks make no paid calls.

## Live checks and limits

Read-only setup and conversation paths have been exercised on macOS through an
existing Codex CLI configuration. This establishes those tested conversation paths,
not general model reliability, write-worker correctness or sandbox enforcement.
The setup review left its inspected project files unchanged and returned a tentative
suggestion without creating assignments or accepting decisions.

A real macOS project was prepared as one task, explicitly approved and launched
through the existing Codex CLI configuration. The worker returned a blocked partial
research handoff after external PDF access was denied and shell retrieval failed.
This verifies the tested handoff and launch path, not completed implementation or
engineering correctness. Its reported test results remain agent claims. The older
run did not capture partial file snapshots; those files remain labeled as reported.
New blocked-result snapshot behavior is validated with injected workers.

Still requiring independent validation:

- Native Windows launch, filesystem behavior and Windows process-tree cleanup.
- Organization-specific CLI builds, provider/model routing and managed policy.
- Completed live implementation, resume behavior and platform sandbox/approval enforcement.
- Semantic correctness of agent outputs and domain-specific engineering methods.

The app does not coordinate unrelated terminals, roll back partial write edits,
relay interactive approvals, continue through sleep or deliver briefings when closed.
Private runtime databases, session logs, screenshots and local execution evidence
are deliberately excluded from the public repository and source archive.


## Assignment research access

The synthetic suite covers default-off and strict-boolean grants, exact approval
capture, approval invalidation/tampering rejection, routing to a single worker,
resumption with the captured session, no inheritance by another assignment, and
the visible permission scope. Public-source/no-private-upload restrictions are
worker instructions; outbound command networking has no domain allowlist.

A live SP-8072 revision was separately approved and launched on macOS using CLI
0.162.1 and the same captured session. Its new turn records workspace-write with
network access enabled, no extra writable roots, and effective headless approvals
`never`. The official NASA handbook download completed and the PDF was inspected
locally. This verifies the research download and resume path for that installed
CLI; it does not verify Windows behavior, grant separate browser permissions,
prove general sandbox enforcement, or establish completion/engineering validity
of the SP-8072 tool. In-flight structured progress notes may carry placeholder
completion statuses; the interface labels them as updates and uses the actual
execution lifecycle for blocked/completed state.


## Large worker events and recovery

A resumed SP-8072 worker was stopped by the previous generic event-size guard
before it returned a final completion report. The saved project files remain on
disk. Its last captured project test run passed 145 of 146 tests; the failure
asserted the previous offline cache identifier after the worker updated it. This
is incomplete work, not an accepted result or verified engineering delivery.

The current parser reads bounded chunks with eight queued records and spills large
records to disk. Fixture tests cover runs above 16 MiB and 20,000 events, Unicode
and escaped text, malformed data, and actual CLI failures. Oversized questions stay
answerable and report downloads retain complete text. These are injected streams,
not live provider validation.

Result tests reproduce a delivery with 40 regular files plus an invalid directory:
all valid files and the original report survive, the handoff names the bad entry,
and acceptance remains unavailable. Additional tests cover missing/unsafe entries,
malformed completion fields, actual CLI failures, a 12 MiB streamed artifact,
insufficient disk space, preservation after an unexpected capture exception,
unchanged deliverables from validation-only continuations, escaped correction
messages, and snapshot integrity checks. Reports distinguish reported checks from
artifact integrity. Browser QA uses a separate fixture workspace; it does not
establish engineering correctness of a real project.

Adapter-generated failures also retain the last meaningful agent progress in the
returned-work view, explicitly labeled as interrupted verification rather than
validated artifacts or completion. A formatter check covers this distinction.


## Per-assignment time limits

Tests cover default and invalid choices, approved unlimited execution reaching the
worker without changing workspace defaults, stale approval/tampering rejection,
exact-session revisions, disabled elapsed-time checks, cancellation/cleanup,
retained session validation and the visible locked choice after launch. These
are synthetic adapter tests; they do not establish an unlimited live run's final
engineering result. The SP-8072 watch remains a separate read-only heartbeat.

## Command-center updates (2026-10-13)

The full suite passed 234 tests after these updates. Fourteen new checks cover
attention lifecycle, retried/dismissed coordinator failures, durable answers, acceptance, reviewed continuation context,
exact-session/fresh-session recovery, cleanup locks, execution-policy validation,
approval invalidation/tampering, YOLO subprocess routing, six concurrent worker slots,
exclusive writer locks and escaped attention rendering. Worker tests use injected
adapters and fixture event streams, not live paid jobs.

An isolated sample workspace on port 8881 was exercised in the in-app browser:
answering a question removed it from Needs you; Resume saved work carried the owner
note and previous report into a draft; sandbox/YOLO draft choices persisted; approval
revealed the separate launch action; accepting a synthetic report removed its review
item. Handoff filtering and the empty state worked. At 390 by 844, document width
and viewport width both measured 390 pixels. The temporary viewport was reset.
Screenshots are private evidence under .relocation/evidence and are excluded from
source packaging. No real project result was accepted during this QA.

The existing live service was restarted only after active_count and active task/job
lists were empty. Its concurrency is now six. Installed codex-cli 0.162.1 advertises
the bypass flag for both exec and exec resume; help-only preflight succeeded. The
new static assets and attention projection were verified through authenticated local
HTTP. Existing assignments remain sandboxed. No live YOLO job or six simultaneous
real model calls were launched; platform/browser permission enforcement remains a
separate validation boundary.

## Saved handoff recovery

Synthetic tests cover matching-session recovery without launching a worker, preservation of the original report and previous capture, supplementary files, refused session mismatches, encoded output-download paths, and follow-up evidence that clears only the resolved checks. Recovery and passing follow-up notes do not accept results or automatically promote them to completion.

## Agent manager

The direct-start and continuation workflow is covered by
`tests/test_agent_manager.py`. Local subprocess fixtures exercise real two-way
pipes, mid-turn steering receipts, owner questions, explicit tool responses,
cancellation and exact-session rejection. Worktree fixtures verify copied
tracked/untracked owner inputs, preserved source state and concurrent isolated
writers. HTTP fixtures verify authenticated batch start and reply endpoints,
including idempotent retries. These checks do not make paid model calls.

## Live Lunar workspace (2026-10-13)

The full repository suite passed 302 tests. The shared projection now verifies
persistent astronaut identity/position, current-turn selection, complete result
history, managed queued/simulated labels, native activity/request vocabulary,
resolved and stopped requests, stale linked questions and private legacy route
compatibility. Existing security, permission, worktree and subprocess checks pass.

Browser QA used an isolated local JSON-RPC subprocess fixture, exercising batch
starts, a native question/answer with a preserved draft, direct continuations,
live steering, earlier-turn results/files, project-preselected launch, exact tool
permission display/decline, Stop, paused continuation controls, disconnect
freeze and recovery after an initial state-request failure. The map stays mounted behind panels. This is API/UI integration evidence;
no real provider/model calls or operational-service restart were performed. See
`static/lunar-base/VALIDATION-LIVE.md` for the full boundary.


## Guardrail fixes (2026-10-13)

Regression checks cover background preparation while state reads, queued replies
and Stop remain responsive; per-UUID HTTP retries without global action blocking;
planned native sessions and explicit deadlines; declared ignored file/folder inputs
without unrelated ignored secrets; rejected external links; questions and reports
above 4 MiB; bounded live previews and exact full permission replies. Older test
expectations that managed results require acceptance before leaving the attention
queue now reflect their optional acceptance. All checks use local fixtures and no
paid model calls. Runtime provider behavior and Windows remain separate validation.

Final verification passed 320 tests, Python syntax, all 26 JavaScript/CJS syntax
checks, deterministic Lunar bundle rebuilds and `git diff --check`. An isolated
browser fixture answered a request above 4 MiB, continued without acceptance,
collected both turns and retained a 6,000,076-byte report with its final line.
The 16 MiB capture regression stayed below 4 MiB of traced Python memory. The
temporary browser/server were closed; no operational service or provider was used.


## Mac app launcher (2026-10-13)

The full suite passed 326 tests, including private instance discovery, URL
containment, concurrent launcher reuse, Finder PATH construction, CLI model/profile
selection and a real provider-free server start/cleanup. The installed arm64 Mac
app passed strict code-signature verification. Finder opening started a detached
server; reopening reused its PID and instance ID. The live UI showed Codex CLI
mode, CLI help confirmed app-server support, and the existing login status passed.
No model task was launched. The Desktop icon opens the current checkout and
retains its existing runtime data; moving the checkout requires reinstalling it.
