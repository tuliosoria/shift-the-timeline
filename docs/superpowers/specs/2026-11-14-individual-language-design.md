# Individual English / Brazilian Portuguese

The authorised scope is a visible accessible EN/PT-BR selector, default English
for Game Off, persistent on reload, independent for each player. All existing
Arthur, audio, private notebook, recovery and case-library behaviour must remain.
The five private mysteries and museum keep their canonical English data, IDs,
truth, clue sources, clocks, rules and exact room revision pins.

## Approaches and decisions

Chosen implementation decision: authored Portuguese sidecars keyed by exact
canonical case revision, plus a public UI dictionary. This permits complete
translation without provider calls, a second set of puzzle truths or changes to
caseVersion. On-demand machine translation would incur unauthorised cost and
unstable facts. Putting translated strings into the canonical case object would
change its hash and strand old rooms. Both alternatives are rejected.

The user authorised implementation without routine design questions. The builder
chooses the additive API/schema below; no changes to provider model, pricing,
quotas, credentials, Azure workflows, permissions or deployments are included.

## Data and behaviour

A library may include `translations`, each containing `locale: 'pt-BR'`, `caseId`,
`caseVersion` (the validated source pin), and complete translated presentation,
suspect text, deductions and solution. The translation schema cannot alter IDs,
culprit, source topology, clock or solution timeline times. All real translations
remain under ignored private/. English data is never re-versioned by a sidecar.
Missing translations fall back to English transparently in case text, with a
case content-locale marker. UI Portuguese remains available independently.

Each player has locale en-GB by default; create/join accept it and setLocale
changes only that player's preference. The browser also stores the preference
locally for landing/reload. A settled old room can change UI language. The room's
ordinary state revision may increment for preference commands; caseVersion does
not. Other players' locale, questions and evidence never change.

A new interview opening uses the chosen locale at selection. Each new question
captures its locale, canonical fallback and candidate deduction text before
queueing. Pending jobs continue using that captured locale even when the player
switches. Existing openings, questions, replies and earned deductions remain
verbatim. Legacy records without locale/text keep English defaults. New evidence
stores its text with its source receipt; delayed AI settlement uses job-local
candidate text. The solution and public dossier can display in the current
preference because they are not prior interview testimony.

AI prompts explicitly select British English or Brazilian Portuguese while
preserving British setting/names, future crime, living victim and all canon.
Offline fake-provider tests verify the contract and fallback; no live model call
is authorised. Suggested Portuguese questions route to the same four topics.

## UI and validation

The selector is keyboard-accessible, visible on 320px phones and labelled in both
languages. Switching preserves active drafts, input focus, case choice, notebook
position and current interview. It cannot silently replace an uncertain command
or spend a question. Dynamic labels, errors, confirmations, audio, accessibility
text and onboarding rules are translated; player names/codes/content are escaped
and never processed by global text replacement.

Tests cover EN default, PT persistence, blocked storage, mid-interview and pending
answer switches, two users with different languages, case/room isolation, old
rooms/jobs, content pin stability, Portuguese topic routing, source parity,
privacy, mobile layout and full sessions in both languages. Independent review
is coordinated by the parent. Commit/branch only; the earlier denied PR action
must not be retried. The parent owns private Library replacement.
