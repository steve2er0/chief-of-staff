# Composer follow-up suggestions

After a completed current agent turn, focusing an empty conversation composer can
show one muted suggested draft. Tab or **Use suggestion** copies it into the normal
editable composer, with the caret at the end. Sending still requires the existing
explicit **Continue agent** action. Shift-Tab retains normal focus navigation;
Escape dismisses the suggestion without closing the panel. Typing, pasting and IME
composition hide it immediately. Dismissal lasts for that report during the page
session, including when a typed draft is later cleared.

**Suggest a follow-up in the agent composer** in Settings defaults on. Turning it
off persists in the existing SQLite settings record and works across browsers.
The service strictly validates this boolean. Changing it does not create work or
change execution permissions.

## Local prediction and abstention

This version uses a deterministic local fallback, not a model-generated prediction.
The current authorized model integration starts tool-enabled CLI coordinator jobs
under explicit real-call actions. It has no tool-free passive prediction endpoint.
Using it on focus would create a job and potentially inspect files. This feature
therefore makes no model, network or API calls and adds no provider or credentials.

`static/followup-suggestions.js` selects the current task in the agent thread, its
latest user instruction, bounded final report and current project decision state.
It recognizes only two narrow signals:

- One explicit structured `next_steps` item asking to run tests yields a test
  request scoped to the latest user instruction (or the saved task title).
- One safe relative artifact path present in both the reported artifacts and saved
  output links yields a request to review that file against the latest instruction.

Report prose and arbitrary next-step instructions are never copied into suggestions.
Strings are data, and all output verbs come from code. No completion, test success,
approval or other factual outcome is asserted. Unsupported signals, multiple steps
or files, unresolved questions/decisions, partial captures, truncated/large reports,
recovery locks, superseded runs and newer user messages yield no suggestion.
Plain discussion replies without an actionable structured signal normally abstain.
Question-word detection is deliberately conservative and can suppress useful drafts.

`static/composer-suggestions.js` mounts the suggestion on the persistent composer.
Acceptance emits only its normal input event, preserving the existing draft map.
The prediction controller uses frozen context keys, abort signals, generation
epochs and a one-second deadline. It rejects results after typing, new reports,
task switches, opt-out, cancellation, loss of focus, panel changes or navigation.
Errors remain silent; refocusing or fresh report context can recover. The current
local predictor resolves immediately, but the asynchronous protections are tested.
The controller has no submission, worker, approval or command capability.

## Validation and rollout

Run the synthetic regression suite with `python3 -B -m unittest discover -s tests -q`.
`tests/test_followup_suggestions.py` covers context selection, abstention, stale
asynchronous results, typing/deletion, cancellation, timeout/error recovery,
keyboard modifiers, Escape, pointer acceptance, draft/focus/caret preservation,
disabled settings, durable opt-out and no automatic submission. Model calls are
mocked throughout the repository suite.

For Mac browser QA, run `python3 -B tests/followup_browser_fixture.py`. It prints
an ignored `.local/followup-qa-*` evidence folder with a private `launch.json` URL.
It seeds four synthetic completed reports directly, has no scheduler, and rejects
every work action. Settings may be saved in its isolated database. `requests.json`
records mutation endpoints so generation and acceptance can be checked for zero
requests. An explicit send deliberately fails, preserving the draft. Stop this
fixture when finished; do not point it at live runtime data.

The running app needs a normal service restart followed by a page reload to pick up
the two new authenticated static routes and settings validation. This change does
not restart a live service. No live agent launches are needed for verification.
