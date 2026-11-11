# Private evidence campaign — November 2026

Base: `b918964`, preserving the phone-first private chat redesign and both recovery fixes in #42/#43. PR #6 was not reused. The public Bracken Quay story, scoring, question budget, repetition rules and AI settings are unchanged.

## Assessment and changes

The game already stored private interviews and the exact message that unlocked each deduction, but the interface lost access to earlier conversations and exposed only a source suspect/turn. The reveal discarded the review journey. Public suspect profiles were also projected safely but unused, leaving a consequential choice to portraits and roles. Landing/lobby copy claimed AI even when the server reported canonical dialogue.

This campaign makes those existing mechanics usable:

- A private interview index, exact source-answer links, labelled read-only transcripts and earlier unsent drafts. Repeated questions and later visits never change a deduction's original source. Legacy records without message IDs use an unlock receipt or link to the whole interview without guessing an answer.
- Review location and drafts survive same-browser reloads where storage permits. Review never sends a command, replaces an uncertain retry or opens an old composer. Host advances and late replies preserve the review; new replies are announced once. Storage failure is described as in-memory-only recovery.
- Evidence remains available before a private summons and after the reveal, with a personal investigation summary. No shared board, teammate transcript or locked clue is introduced.
- Selecting a suspect exposes only their existing public profile before the turn is committed, with keyboard focus on that dossier. Landing explains three to four players and one phone each. Notices reflect the server's actual dialogue mode and describe authored fallback/repetition honestly.

## Regression gates

`npm test`, `npm run check`, `npm run test:browser`, both package targets, npm audit and the existing CI jobs are the release gates. The added Node tests cover exact private receipts, repeat/revisit stability, legacy records, escaping/read-only rendering, room/player recovery scope and blocked storage. The browser suite includes:

- Three isolated phones, an accepted request with a dropped response, exact-body retry on reload, newer draft retention and read-only navigation while acknowledgement is pending.
- Source focus/return, real polling, reload, a late reply during host advance, an interrupted turn's draft, revisiting the same suspect, and a 320px low-height viewport with long text.
- Public-demo evidence review before voting and after reveal; cancelled summons preserves selection; sealed votes and transcripts stay unchanged.
- Canonical and fake-AI onboarding, 320/390px dossier browsing, keyboard focus and no question/selection commands before commitment.

These are deterministic fixtures and an authored public-demo route, not an unspoiled editorial playtest. No paid AI calls are used. Existing gameplay tests preserve repeat-question behavior. Safari/iOS keyboard and assistive-technology testing, pacing/difficulty playtesting and the private editorial case remain separate validation limits.

## Delivery boundary

No workflow, deployment setting, AI policy, credential or infrastructure file changes are part of this campaign. A main merge uses the existing verified-package Azure workflow. Before and after an eventual merge, verify exact commit identity, CI, `/healthz`, `/api/release`, and `/api/cases`; canonical mode must be confirmed before live smoke-test questions. Existing rooms retain the unchanged case version and browser storage schema remains version 2 with optional notebook records.
