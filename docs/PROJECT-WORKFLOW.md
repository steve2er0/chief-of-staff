# Project workflow — 2026-10-12

The owner supplies the vision, makes decisions and chooses agent assignments.
The CoS preserves continuity, proposes a breakdown and recommends next steps.

## Setup review

Project creation in Codex mode saves the owner's vision and references, then queues
one read-only CoS orientation. The CoS inspects the available folder and references
itself before suggesting the next move. Blank folders are valid; the review builds
from the vision alone when appropriate. The response uses the conversation contract
and remains a tentative proposal. No work map, assignment, accepted decision or
project edit is created by this review. Local mode remains explicitly non-AI.

A durable `setup_review` record tracks pending, running and terminal states, the
project version and its coordinator job. The scheduler honors capacity and folder
locks and performs help-only CLI preflight when required. Save remains successful
if preflight or the model fails. Pending reviews survive restart; interrupted calls
require confirming the old process stopped before retry. Completed reviews do not
replay on reload/restart. Existing projects can request a review explicitly, and
changed context requires reviewing fresh suggestions before adoption.

## Conversation first

The project opens on a conversation, a short **Where we are** note and one
**Suggested next step**. CoS builds on the owner's latest message and earlier
context, contributes a useful thought and proposes one concrete next move.
Questions are exceptional: a meaningful owner decision must be needed now,
with different answers materially changing the next step, scope or commitment.
CoS does the reasoning already possible before asking one focused question,
explains why the choice matters, and leaves details that can wait in the
background. Early discussion does not require a milestone, dataset, format or
acceptance checklist. Planning fields and the questions array may remain empty.

The conversation instructions override earlier question-heavy assistant replies
as a pattern of behavior while retaining them as historical data. The prompt
includes the plotting follow-up as a regression example: once plotting is the
stated intent, suggest a useful next move instead of requesting the same intent
again. This follows the initiative and clarification guidance in the
[official OpenAI prompting documentation](https://developers.openai.com/api/docs/guides/latest-model#initiative-and-follow-through),
adapted to this app's explicit delegation boundary. The configured model is
unchanged; behavior is checked with the existing live CLI connection.

**Delegate work** opens **Agent task**. **Prepare one agent task** uses the vision,
captured conversation and agreed context to draft exactly one assignment. Research,
implementation and checks are subtasks inside the brief. A read-only Codex call
prepares the brief; the owner reviews its scope, permissions and output files before
separately approving and launching one worker. The worker is instructed to perform
the subtasks itself. Local mode provides an editable non-AI draft. Completed model
responses containing multiple tasks are rejected, and project changes during
preparation require a fresh brief. Captured conversation survives approval refresh.

The work map remains available as a secondary planning view for projects needing
separate assignments. Opening delegation does not call a model or launch workers.
The owner can still request a breakdown, adopt pieces and select specific pieces.
The whole-project path preserves existing work pieces without automatically marking
their dependencies or completion; result acceptance remains an owner decision.
The brief leads with an editable goal, outcome-based completion criteria and the
permissions. Detailed instructions, expected output files and captured context
are expandable. CoS is instructed to keep the brief concise and use three to five
criteria; existing reviewed briefs remain intact. The normal delegation view shows
one task and its results. Splitting is an explicit choice under detailed planning.
Unsent conversation text survives switching between these views within the page.

Public web research is a separate checkbox in the assignment brief, off by default.
It requires workspace-write so retrieved sources can be saved locally. The choice
is part of the frozen approval digest; changing it requires approval again. A
revision preserves the previous choice and captured session, but always needs new
approval and launch. The adapter applies the approved command network setting on
fresh and resumed runs. This is outbound network permission, not a domain
allowlist or a grant of separate browser/tool permissions. Public-source-only
research and no private uploads are instructions to the worker. CoS conversation,
setup review and planning do not inherit a worker's research permission.

The owner can approve **No time limit** for an individual assignment. This is part
of the exact brief, survives revisions, and only changes that worker's effective
timeout. The workspace default stays in effect for other work. Manual pause and
cancel remain available; a disabled deadline does not authorize extra access or
accept the eventual result.



Earlier conversation records are preserved and shown in collapsed history.
New conversational replies have a presentation style distinct from planning
replies. Model planning fields remain proposal data until explicitly adopted.
A short tentative summary is labeled **Working understanding**; it never becomes
agreed project direction through display alone. Intake asks for vision and an
optional name, with supporting fields in a collapsed **Project details** section.

## Canonical records

- `project`: vision and revision history, priority, optional target date, adopted brief, checkpoint, existing decisions and accepted results.
- `message`: durable user/CoS conversation with time, source and proposal link. A discussion message is not an approved decision.
- `proposal`: editable framing or work-map proposal, source, based-on project version, user adoption/dismissal and adopted contents. Stale proposals cannot be adopted.
- `work_item`: project piece, purpose, expected outcome, criteria, type, owner, state, dependency IDs, task links and completion evidence.
- `plan`/`task`: existing approval and execution records. Linked assignments retain their approved project snapshot and stable spec identity.
- `finding`: user-recorded useful parts of a returned result with references to its hashed output snapshots. Full review remains open.
- `portfolio`: available time, selected focus, last reviewed briefing time and a legacy overall-vision preference.
- `focus_advice`: optional model recommendation, its frozen project/task versions and preference snapshot, source and coordinator job.

Worker execution follows the existing approve/launch boundary. Decomposition,
ownership, focus selection and partial findings do not authorize workers.
Dependency changes invalidate prepared approvals. Completed/deferred pieces and
pieces with outstanding dependencies or active/unreviewed assignments cannot be
delegated. Revisions preserve the work-item link and require new approval.

## Progress and returned work

The latest meaningful agent message is retained separately from tool activity.
Structured progress messages display their summary, rather than raw JSON. Tool
events refresh last-activity time and stay in a collapsed activity log; they do not
replace the agent's explanation. Elapsed time is measured from worker start and
stops at its recorded end. It is not a completion percentage or an ETA. Legacy
histories are formatted on read without changing approved assignment snapshots.

A reported blocker is visible while the process is still running. Only the verified
terminal completion protocol changes task state. A tool command finishing or an
intermediate agent message never completes or accepts the assignment.

Returned work leads with changes, checks reported by the agent, limits, what needs
owner judgment and the suggested next step. Future workers are asked to structure
their final summary using Changes, Checks and Limits; legacy reports remain
available in full. Artifact hashes establish file integrity, not scientific
correctness or test success. Blocked workers can return partial snapshots without
being eligible for acceptance. Failed snapshot capture is shown separately from
the worker's original blocker. Existing unsnapshotted results remain labeled as
reported files; they are not retroactively represented as verified output snapshots.

Worker-raised items remain suggestions until adopted. Earlier unadopted worker
items that were automatically stored as questions are reclassified as suggestions;
owner questions, answers and approved records stay intact. Review notes and
revision drafts survive progress refreshes and in-page reopen. Accepted results
and their next steps become the project checkpoint; unfinished background work
pieces do not automatically supersede the accepted whole-project outcome.

## Guidance and model behavior

Local conversation stores the user's notes and offers a generic next-step
suggestion without generating automatic questions. It does not interpret free
text as instructions to alter canonical state. Local decomposition
provides an editable generic starter map. Local portfolio guidance uses supplied
priorities, optional dates, review/question needs, dependencies and available time;
it does not semantically interpret the overall vision. These limits are labeled.

Configured Codex can discuss and propose framing, decompose the actual project,
review task results, and recommend focus across projects. Setup review is queued automatically at creation in Codex mode; later requests
are explicit read-only coordinator calls. Discussion and decomposition can use a
neutral demo workspace before a real working folder is selected. Real workers
still require an existing authorized folder outside app storage/source. Model
JSON contracts, target identity checks, CLI preflight, timeouts, directory locks,
session capture and cleanup remain enforced by the app's existing adapter.

Codex focus advice does not alter priorities, select a focus or create assignments.
The UI falls back to current local guidance when its underlying snapshot changes.
Briefings and local suggestions update while the service is running. This change
does not add email/desktop notifications or operation while closed/asleep.

## Validation

The automated synthetic suite covers intake, preserved vision/source history,
explicit adoption, stale proposals, graph integrity, stable assignment links,
selective delegation, dependency gates, manual evidence, partial review, explicit
piece completion, revisions, migration, durable checkpoints and portfolio guidance.
Injected adapters cover model contracts without requiring credentials.

Browser checks use separate synthetic data. Read-only conversation and setup review
have also been exercised with an existing local Codex configuration. Write workers,
organization-specific policy, native Windows integration and engineering validity
remain separate validation boundaries. See [VALIDATION.md](VALIDATION.md).

## Command-center attention and continuation

Needs you combines pending assignment approvals/launches, owner questions and
proposed decisions, stopped assignments, returned results and current coordinator
failures. Home and activity previews use the same read-only projection. Resolving
an item updates its source record; no duplicate notification record can become stale.
A question answer becomes future project context, not live agent steering or tool
permission approval.

Resume saved work captures the owner's handoff note and the predecessor's report
and output metadata in a draft. Original instructions remain stable over retries.
Review the continuation, approve its scope and execution policy, then explicitly
launch. Continue the exact captured session when folder and CLI/model match; otherwise
choose a fresh session. Scope revision uses the same reviewed path. Neither choice
accepts partial work or marks a work item complete.

Settings permits six concurrent jobs, including coordinator calls; writer folder
locks remain in force. Sandboxed execution remains the default. Editable assignments
can explicitly select YOLO (--yolo), which removes CLI sandboxing and command prompts.
The choice is frozen in approval and checked against the installed CLI for new and
resumed calls. Browser permissions remain external; denied browser actions are not
retried through another surface. Existing assignments are never upgraded implicitly.
