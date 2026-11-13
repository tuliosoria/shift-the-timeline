# Investigation interface validation

> Superseded by the 2026-11 mobile chat redesign: the Analyse / Interrogate / Deduce flow, shared board, correlations and sharing described below no longer exist. See [UI design](UI_DESIGN.md).

Date: 10 November 2026. No deployment or GPT activation.

## Implemented scope

British-English Analyse / Interrogate / Deduce flow, illustrated suspect dossiers and stage icons, canonical sharing previews, structured public-source hypotheses, round review and confirmation, private accusation, local scoped drafts, history and safe pending retries. The private English editorial package is a separate versioned input and is never shipped in browser assets or public test evidence.

## Automated evidence

- `npm test`: 182 passed, 0 failed.
- `npm run check`: syntax checks passed.
- `npm audit --omit=dev`: 0 known vulnerabilities at the checked point.
- `npm run package`: 36 exact allowlisted immutable files, with private material excluded.
- Three- and four-player isolated HTTP sessions complete all rounds, share only canonical evidence, add two distinct hypotheses and a note, safely replay a confirmed correlation after phase transition, and keep ballots private until reveal.
- The real form submission is tested against the real game service for all four canonical topic shortcuts.
- Regression tests cover stale notes and confirmations, old fragments after reload, current-versus-history interviews, draft acknowledgement races, keyboard focus across DOM replacement, modal focus return/Tab wrap and mid-play storage failure warnings.

## Visual and browser evidence

A separate checksum-verified synthetic-only bundle was run in real Chrome on a connected Mac. No production accounts, private editorial content or external deployment were involved.

Baseline checks passed:
- All three stages at widths 320, 390, 768 and 1440 CSS pixels, plus a 390×380 low-height viewport: document width did not exceed viewport width.
- Actual Chrome 200% zoom from a 1440×900 viewport produced a 720×450 CSS viewport with no document overflow in any stage.
- Rye rendered correctly and WebP portraits composited with genuine transparency.
- Enter inserted a newline rather than submitting a textarea; an unsent question survived navigation, reload and a real poll update.
- Moving to Deduce did not close an interview. Canonical sharing previews excluded the private question.
- Duplicate correlation sources were rejected; hypotheses remained explicitly unverified.
- Finish confirmation named unused questions and local drafts; a new round retained old unsent text in labelled recovery.

Baseline browser testing identified modal focus return and Tab wrapping issues. These and the source-review findings were fixed with failing-then-passing regressions. The focused final-patch retest passed: Cancel/Escape restored the exact trigger, Tab/Shift+Tab wrapped inside the dialog, dossier/share/summary/radio focus survived polling, the motive shortcut returned the motive answer, and a stale fragment after round advancement reopened Analyse with explicitly labelled old interview history. No console warning or error was observed. The full responsive sweep was run on the baseline; these targeted regressions were repeated on the final patch.

Additional final-build Chrome checks passed:
- Browser Back/Forward preserved stage order and a 300-character draft.
- A 60/60 board displayed every record, explained capacity, blocked new notes/hypotheses and canonical sharing, and still allowed round review and finish.
- 24-character codenames, 300-character questions/hypotheses and 500-character notes, including unbroken sequences, produced no horizontal overflow at 320, 390 and 1440px. Editorial suspect names were not replaced for this test.
- Real HTTP 404 portrait responses fell back to initials without disabling dossiers or selection.
- A loopback-only proxy discarded a response after the server accepted the question. The client offered safe retry; all three attempts had identical bodies and IDs, only one question was recorded, and a newer draft remained intact.

No application files were modified to induce these failures, and final application hashes matched the tested patch. No additional browser defect was observed. Local QA servers and tabs were closed after testing.

Computed design-token contrast met the stated target: primary text/panel 13.56:1, secondary text/raised panel 7.26:1, dark text/gold 9.50:1, and secondary text on a 90%-opaque panel over white 6.25:1. These calculations are not a full WCAG audit.

## Review decisions and compatibility

- New notes carry round and phase; stale first executions are rejected. Older clients omitting both retain the legacy contract. Receipt-first retries return the current authoritative state with the original record unchanged.
- Initial stage restoration uses the exact saved room/player/round/phase. A stale URL fragment cannot override a new round's Analyse default. Back/Forward remains local navigation after load.
- A missing current interview is an empty state; earlier interviews require explicitly labelled history selection.
- Arbitrary free questions retain deterministic topic inference. The interface discloses canonical dialogue and no generative AI; unchanged canonical shortcuts send their exact topic.
- Private English content received separate structural, reference, outcome-parity and editorial checks. UI work did not inspect the solution to inform art or public examples.

## Remaining validation limits

Chrome testing is not Safari, iOS keyboard, screen-reader or comprehensive assistive-technology certification. No live DynamoDB/Lambda/DNS/TLS test, deployment or competition-rule audit is claimed. A multi-person editorial playtest and competition submission review remain separate steps.

## Connection recovery follow-up

A connected client sends a presence heartbeat every 30 seconds. Heartbeats do not
extend the six-hour idle or 24-hour absolute room lifetime. Another participant
may explicitly claim the host role after 120 seconds without host contact. The
old host stays in the game, retaining private interviews and any accusation.

During accusation, a host who has voted may explicitly finish with abstentions
only when every missing voter has been out of contact for 120 seconds, measured
no earlier than accusation start. Missing choices stay null, cannot create a
complete victory, and never count as innocent arrests. Concurrent renewed
presence or votes are rechecked transactionally. Background browser suspension
can look like disconnection; users are told to keep the page connected.

Fake-clock engine/durable tests cover premature recovery, renewed presence,
legacy rooms, retries, races, expiry and result scoring. Client regressions cover
confirmation, heartbeat cadence and abstention wording. A synthetic Chromium
recovery flow is included in CI; see its run for actual browser execution status.
No live AWS or editorial-case playtest is implied by these checks.

Heartbeats still create normal durable idempotency receipts (one per request,
retained until the room's absolute 24-hour deadline; DynamoDB TTL deletion is
asynchronous). They do not grow the per-player engine request map. The local
MemoryStore is a development adapter and does not prune receipt rows. This is
not a constant-storage presence service; receipt volume and write costs must be
reviewed before production, or replaced with a dedicated coalesced presence path.

## Canonical interview topic guidance

Each of the four canonical topics can consume a question only once per player's
current interview. A repeated explicit or inferred topic is rejected without
changing the room version, budget or transcript; retrying the same committed
request remains successful. This prevents keyword paraphrases from silently
spending limited turns on an identical answer. Other players and later rounds
retain independent interviews.

The interface identifies the matched topic before sending, marks topics already
heard as “Review answer”, and focuses the existing private answer without a
request or automatic sharing. Keyword matching is explicitly not described as
AI understanding. Closed/history interviews keep review links; unused question
controls remain disabled. Client and transactional regressions cover this rule,
and the synthetic Chromium flow exercises keyboard focus, draft preservation
and rejected repeat submissions.

## Keyboard continuity during live updates

A room snapshot can replace controls while another agent joins, chooses a suspect
or receives a reply. The client now restores focus to the same uniquely identified
control, rather than its position or label. Text selections are retained when an
input is replaced; a live input is left untouched. Deliberate navigation and open
dialogs keep ownership of focus. If the former control disappears, becomes disabled
or belongs to a replaced screen, the main content is the safe fallback.

Confirmation cancellation resolves the current equivalent of its opener, including
when a room update replaced the original button while the dialog was open. A turn
change can still dismiss an obsolete confirmation and focus the new screen.

`tests/focus.test.mjs` covers semantic identity, caret restoration, hidden/disabled
and ambiguous targets, deliberate focus moves and modal boundaries.
`tests/browser-focus.mjs` uses three isolated Chromium contexts and synthetic local
AI to cover live lobby updates, navigation focus, modal polling and Escape,
round-change dismissal, draft caret preservation and 320-pixel short-phone layout.
Screenshots are local test artefacts. These checks do not claim native screen-reader
or iOS/Android assistive-technology validation.

## Selected suspect review and commitment

The selected dossier now contains its single Question or Summon action, immediately
after the private-file review link and before the other suspect cards. From dossier
focus, two Tab presses reach the action instead of traversing the review link and
all 15 cards (17 presses). The previous sticky footer was already visible on touch;
this change fixes the mismatched reading/focus order, not an offscreen touch button.
A full suspect name identifies the selected action even when a long profile scrolls
its heading out of view. An unselected screen retains its disabled Choose a suspect
footer. Summoning still opens the existing irreversible-action confirmation.

`tests/selection-actions.test.mjs` checks order, a unique action, disabled empty/stale
selections, escaping and read-only rendering. `tests/browser-selection-actions.mjs`
uses local synthetic data and isolated 320/390px phones to cover last-card selection,
deselect/reselect, keyboard and touch, live polls, private-file reload/return,
long profiles and names at 380px height, and Cancel/Escape before one confirmed vote.
