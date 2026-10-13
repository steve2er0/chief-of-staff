# Validation

## Automated checks

The current source passes **166 automated tests** using:

```sh
python3 -B -m unittest discover -s tests -q
```

Python source parsing and syntax checks for all five JavaScript files also pass.
Model subprocesses are mocked in the automated suite; tests use temporary synthetic
projects and do not make paid model calls or require credentials.

| Area | Covered behavior |
| --- | --- |
| Projects | Vision/history persistence, optional context, proposal adoption, stale-proposal rejection, checkpoints and portfolio continuity |
| Delegation | Explicit selection, acyclic dependencies, draft/approval/launch separation, exact approved context, duplicate prevention and linked work pieces |
| Review | Output integrity, partial findings, acceptance notes and separate work-item completion |
| Setup review | Automatic read-only orientation, empty folders, busy/writer gates, cancellation, preflight failure, retry, restart persistence and interrupted recovery |
| Message delivery | Exact message/job/request links, local-only receipts, rejection without a false message and idempotent retries |
| Files | File/folder containment, traversal/network path rejection, symlink handling, bounded metadata browsing, file-copy integrity and history retention |
| Word import | ZIP/XML limits, duplicate/entity refusal and no archive extraction or external relationships |
| Workers | Success, blocked/failed states, concurrency, directory locks, pause/cancel, recovery and distinct captured sessions |
| CLI adapter | Help preflight, fixed argument construction, schema fallback, exact-ID resume, malformed/error event rejection and cancellation through mocks |
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

## Live checks and limits

Read-only setup and conversation paths have been exercised on macOS through an
existing Codex CLI configuration. This establishes those tested conversation paths,
not general model reliability, write-worker correctness or sandbox enforcement.
The setup review left its inspected project files unchanged and returned a tentative
suggestion without creating assignments or accepting decisions.

Still requiring independent validation:

- Native Windows launch, filesystem behavior and Windows process-tree cleanup.
- Organization-specific CLI builds, provider/model routing and managed policy.
- Live write workers, resume behavior and platform sandbox/approval enforcement.
- Semantic correctness of agent outputs and domain-specific engineering methods.

The app does not coordinate unrelated terminals, roll back partial write edits,
relay interactive approvals, continue through sleep or deliver briefings when closed.
Private runtime databases, session logs, screenshots and local execution evidence
are deliberately excluded from the public repository and source archive.
