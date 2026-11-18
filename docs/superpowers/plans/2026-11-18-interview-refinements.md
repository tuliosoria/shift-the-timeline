# Interview refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ground follow-ups in the stored opening and clarify interview guidance.

**Architecture:** Add optional untrusted opening data to the existing bounded AI context; update existing premise instructions and presentation copy only.

**Tech Stack:** Node.js modules, node:test, Playwright.

**Spec:** User-approved delegated interview-refinement scope, 18 November 2026.

Base: `478da738d4ad22b203d4016331421ede8e20773b`. Work in the isolated `feat/interview-refinements` worktree. Existing case data, translations, rules, provider parameters and deployment configuration stay intact.

## Global constraints

The stored opening is optional, exact and untrusted; never regenerate it from a current translation. Keep the existing 20,000-byte provider context and 65,536-byte stored Item ceilings. No case facts, solutions or private evidence in public files. No provider/model, gameplay-rule or deployment changes.

## Review focus

Missing legacy openings; an opening in an earlier language; foreign player/suspect data; malicious or oversized openings; final-turn copy that must not promise another interview turn. These are covered by the opening/history tests and EN/PT guidance tests/browser flow below.

## Changes and verification

- [x] Add failing synthetic tests for the exact stored current interview opening in AI admission, legacy absence, player/suspect isolation, immutable queued context and existing context/storage limits. Pass that opening as untrusted conversation, never as canonical authority; keep earlier-turn exchange selection unchanged.
- [x] Extend the existing premise instruction to reject invented past reactions, beliefs and changes of mind. Check prompt contracts for living victims, knowledge provenance, malicious conversation and deduction completeness. These are prompt constraints, not a new runtime semantic validator.
- [x] Clarify EN/PT-BR suggestion, completed-interview and waiting copy, including source attribution versus player hypotheses. Preserve controls and three-question flow. Verify both languages in unit/browser tests, draft/caret preservation and no extra question.
- [x] Inspect private playtest evidence for unequivocal routing defects. Use only synthetic public tests if a narrow correction is warranted; otherwise record the deferral without publishing private case content.
- [x] Run relevant tests, full Node suite, static checks and browser suite. Record any unchanged environment failure separately. Request independent root review before committing. No push, PR, merge, deployment or paid provider calls.

Targets: `server/ai/chat-context.mjs`, `server/ai/jobs.mjs`, `public/views.js`, `public/i18n.js`; regressions in `tests/interview-opening.test.mjs`, `tests/interview-guidance.test.mjs` and `tests/browser-guidance.mjs`.

## Evidence

- RED: `node --test tests/interview-opening.test.mjs tests/interview-guidance.test.mjs` reported 8 tests, 3 passes and 5 expected failures before implementation. GREEN: all 8 pass; the focused prompt/history set passed 84 tests.
- Clean base extracted from `478da738`: `npm test` reported 613 tests, 611 passed, one failed, one skipped. Final implementation: 621 tests, 619 passed, the same one failed and one skipped.
- The unchanged failure is `tests/local-secret.test.mjs:3`, “local credential reader reads private file lazily, never changes environment”. Its synthetic fixture is rejected because this cloud process has UID 1000 while `/` and `/tmp` have UID 65534. No credential-reader protections were changed. PostgreSQL skips without its test URL.
- `npm run check` and `git diff --check` pass. All 19 scripts in `npm run test:browser` pass with `/usr/bin/chromium` (exit 0), including EN/PT guidance at 320/390px, low-height reminders, F5, drafts/caret, private history and no fourth question; no paid provider was involved.
- Private offline checks admitted 408 contexts: 180 EN/PT authored-opening combinations, 216 recorded questions, six witness-sample originals and six scoped paraphrases. Largest provider context: 13,441 bytes; largest stored Item: 15,036 bytes. Source data and original playtest files were unchanged.
- All canonical routing changes are deferred: the reported follow-ups require contextual interpretation or authored boundary answers, and no narrow general correction was established. Exact references and validation logs remain ignored under `private/interview-review/`.
- Independent review cleared core, copy and mobile regressions. Prompt tests establish deterministic instructions and context contracts, not generated semantic fidelity: the existing runtime validates allowed deduction IDs, not whether a provider's reply actually states every fact. No live AI validation is claimed.
