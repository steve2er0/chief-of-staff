# Explicit requests for the owner

Requests appear in the live Lunar Base and the selected astronaut’s side panel.
Open the private CoS launch URL; the root page and previous Lunar mode URLs all
show the live workspace. Start CoS normally with `python3 -B app.py --port 8876`.
Do not start a second service against an already-open operational database.

Native app-server questions and tool permissions come from `live_requests`,
including when the structured owner snapshot is empty. Their exact forms target
the live request ID. **Reply & continue** sends an answer; permission buttons
respond separately. Ordinary replies do not expand permissions. Stopping an agent
removes its native question controls and marker. Continuations retain one astronaut
and ignore old project questions tied to superseded/cancelled turns.

The five-character attention demo remains a local source fixture. Its historical
24-second cycle and raster evidence below are scripted, with no real agent calls.
It is excluded from product navigation and the served scene bundle.

## Worker contract

Legacy structured workers may include this optional object in a structured progress
message with `summary`, or in their completion response:

```json
{
  "version": 1,
  "revision": 1,
  "state": "needs_user",
  "items": [
    {"id": "sample-rate", "kind": "question", "text": "10 Hz or 50 Hz?"}
  ]
}
```

Place this object under `user_requests`. Kinds are `question`, `decision` and
`approval`. Request IDs are stable within one request; revisions strictly
increase for a changed request set. At most ten items and 2,000 characters per
request are allowed. Resolution uses a greater revision, `state: "resolved"`
and `items: []`. Omitted fields, tool events, a repeated poll and selecting a
character never resolve a request. Malformed or conflicting revisions retain
the previous valid request. New occurrences should use fresh IDs; reusing an
ID after withdrawal creates a fresh response record.

Progress/completion persistence creates linked project question or decision
records. GET snapshots remain pure. The live panel exposes existing response
controls; linked owner answers are saved as context and sent through the direct
agent continuation flow. No second planning approval or result acceptance is
required. Tool permissions remain separate exact native requests.

Requests remain visible after a saved answer until an explicit agent/workflow
resolution. Illustration resumes only with a fresh, actually running record
and an activity timestamp at least as new as the resolution. A blocked,
waiting or completed-review lifecycle remains held. Recovery locks, stale
activity/snapshots and disconnects stop attention motion; last-known amber
indicators and precise requests remain visible. Pause and reduced motion use
a planted static front-facing pose, question marker and beacon. The visible
text distinguishes needs-you, generic blocking, ordinary waiting and review.

Legacy explicit `decisions_needed` / completion `decisions` lists on stopped
handoffs are supported with a metadata warning and existing continuation
controls. Generic prose never becomes an inferred question or approval. An
input-needed lifecycle without request text is identified as missing metadata.
Real project questions and draft/approved assignment records appear at the
building beacon without inventing an astronaut for an unstarted assignment.

## Assets and evidence

The approved Library art board is unchanged. Built-in image generation produced
`source/attention-turn-wave-original.png`. Deterministic alpha extraction,
nearest-neighbour scaling, helmet-axis/boot registration and trim recolouring
produced separated transparent attention atlases. Five consistent-hand source
poses supply four turn and four wave timeline cells; the three opposite-hand
poses are excluded. Every foot anchor is `(32, 58)`. The existing texture
regions are pixel-identical. Manifest: `source/attention-asset-manifest.json`.
Rebuild with `python3 source/prepare_attention_assets.py` (Pillow required for
asset preparation only), then `python3 source/build_scene.py`.

`validation/attention-scene.png` contains the actual paused Canvas indicators.
`validation/attention-motion.gif` contains actual measured Chrome Canvas frames,
including turning/waving, a saved-response hold and resolved movement. It is
12.5 seconds long with 43 distinct frames, captured at 384×256 and presented
at 768×512. `validation/attention-evidence.json` records capture dimensions and
timing. A static PNG alone is not evidence of motion.

Validation: `python3 -m unittest discover -s tests`; isolated fixture browser
checks; exact CoS answer-form navigation without submission; no CoS API POSTs;
reduced-motion capture with 55 identical Canvas frames; disconnect retention;
registered asset and unchanged-pixel checks. No real worker was started and
no operational store or existing CoS process was opened by the QA harness.

The end-to-end contract is validated through synthetic progress/completion
fixtures and browser records. An actual Codex worker session was deliberately
not launched. Existing running CoS processes require their normal restart to
load the new backend code; no process was restarted during implementation.
