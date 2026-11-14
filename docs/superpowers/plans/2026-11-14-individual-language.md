# Individual Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. The user explicitly authorised Astra delegates and no routine approval questions.

**Goal:** Deliver independent persistent EN/PT-BR preferences without changing case truth or earlier testimony.

**Architecture:** Public UI messages and authored private case sidecars are separate. A per-player locale controls future output; question/job and deduction receipts capture immutable language-specific text. Canonical revision hashes remain unchanged.

**Tech Stack:** Existing JavaScript modules, Node test runner, Playwright, current stores; no new dependencies or provider calls.

**Spec:** ../specs/2026-11-14-individual-language-design.md

## Global Constraints

- Default en-GB; only en-GB and pt-BR.
- Three/four players, four turns, three questions per turn, British setting and future crime unchanged.
- Private translations and solutions remain ignored, outside public Git.
- No PR, merge, deployment, credentials, cost/model policy or Azure workflow changes.

## Review Focus

- Change language while a reply is pending: that reply keeps its original locale.
- Retry lost setLocale/create/ask responses: no extra seat/question or language crossover.
- Old room/job without locale/text fields: default English; same original content pin.
- Typed text matching a UI label: never translated or overwritten.
- Shared names/IDs across cases and two players: sidecars and evidence remain scoped.

### Task 1: Sidecar validation and projection

Files: server/case-locales.mjs, server/case-loader.mjs, tests/localisation.test.mjs, synthetic fixture.
Interfaces: normaliseLocale(value), validateTranslations(raw,registry), localiseCase(caseData,translations,locale), localiseCatalog(catalog,registry,translations,locale).
- [x] Write failures for structural/source-pin mismatch, unknown fields, missing/duplicate entries and source-graph changes.
- [x] Implement bounded complete text-only sidecars without mutating raw canon or version.
- [x] Verify translated projection plus English fallback; private fields remain server-only.

### Task 2: Per-player preference and immutable output

Files: server/game.mjs, persistent-game.mjs, api.mjs, deductions.mjs, ai/jobs.mjs, ai/chat-context.mjs; focused tests.
Interfaces: create/join optional final locale argument; action {type:'setLocale',locale,id}; snapshot.me.locale and snapshot.case.locale; message.locale captured at ask.
- [x] Add failing tests for two-player isolation, locale switch during pending answer, replay, legacy job, history/deduction freeze and unchanged caseVersion.
- [x] Pass sidecars through runtime; localise only current player view/new answer; freeze deduction text with receipts and job scope.
- [x] Select output language in prompt using message.locale; maintain all provider parameters and history scoping.
- [x] Run focused domain, persistence, AI and language tests.

### Task 3: Public UI and accessible preference

Files: public/i18n.js, app.js, views.js, chat.js, question-topics.js, index.html/style.css, server/public-assets.mjs, tests/browser-language.mjs.
Interfaces: browser locale state defaults EN and persists localStorage; API create/join locale plus setLocale; catalogue GET ?locale=pt-BR.
- [x] Add language unit/browser failures for selector, F5, input preservation, mobile, mixed users and ongoing interview.
- [x] Translate static/dynamic UI and suggested prompts using explicit dictionaries/functions, never replacing arbitrary story/user text.
- [x] Wire preference with room action acknowledgement/retry; preserve drafts and history.
- [x] Verify keyboard/320px, audio labels, recovery and both language flows.

### Task 4: Private content and final review

Files: private/locales/*.pt-BR.mjs, private/campaign.mjs, private notes and validation artifacts only.
- [x] Translate all six cases faithfully, preserving names, times, clue graph and epistemic limits.
- [x] Validate completeness/parity and all conversations' context bounds, then run real private sessions in both languages.
- [x] Obtain independent review; address findings; run broad existing regressions.
- [x] Commit public code/tests only; scan for private text. Build a separate bilingual private archive, preserving the previous original ZIP. Parent replaces the same Library identity.

## Execution record

Implementation and independent core/UI and translation reviews are complete.
Review findings were covered by regression tests: missing locale, preference
receipt growth, rejected-entry recovery, same-player tab synchronisation and
explicit rejoin preference precedence. The browser catalogue interceptor was
updated to accept the new optional language query.

Public validation and known environment limits are recorded in
`2026-11-14-individual-language-validation.md`. Private sources, narrative
reviews and actual-case validation are retained only in the private archive.
The prior English archive and all canonical case pins remain unchanged.
