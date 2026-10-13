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

**Delegate work** reveals the work map, assignment selection, full brief,
background proposals, results and evidence. Opening it does not call a model,
create pieces or launch workers. The owner requests a breakdown, adopts pieces,
selects assignments, approves and launches through the existing separate steps.
Unsent conversation text survives switching between these views within the page.

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
