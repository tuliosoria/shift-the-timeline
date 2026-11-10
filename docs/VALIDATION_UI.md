# Investigation interface validation

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
