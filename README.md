# SHIFT: The Timeline

> **Azure release receipt, 11 November 2026:** PR #48 is live at `370ab445`, with hosted AI verified and the 6,000/1,024-token policy active. Production spending remains uncapped, with concurrency 2. Later commits require their own release verification. See [Azure handoff](docs/AZURE_HANDOFF_2026-11.md).

A cooperative investigation game in British English for 3–4 players, played as a phone-first chat. A crime is foretold; each player privately interviews suspects, unlocks deductions and makes an individual accusation.

## Current development build

The game is a messenger-style interrogation. You pick a suspect, ask questions in a chat, and unlock deductions that appear as toasts.

- Rules: 3–4 players, 15 suspects, four turns of six story-hours each. Each turn you may ask three questions and talk to one suspect (revisiting an earlier suspect is allowed). The turn ends on your third answer. The game moves to the next turn when every player has finished or the host advances it after a confirmation.
- The story clock is set by the case through the optional `clockStart` (default 20:00; the public demo, Bracken Quay, starts at 18:00).
- Accusations are individual and irreversible. The reveal reports one of three outcomes: complete, partial or defeat.
- Admitted questions receive an AI-voiced suspect reply when AI is configured (`dialogueMode: 'ai'`). The model receives up to eleven earlier resolved exchanges with this suspect from the same player and room, including previous turns. Whole exchanges may be omitted to fit the storage envelope; they are never summarised into new facts. Already-earned deduction IDs are scoped to this suspect and removed from the prompt's award candidates, while the authorised facts and canonical fallback remain available. The model returns `{reply, unlocked}`. Canonical answers are the fallback whenever a call fails or the budget refuses it, so provider failure does not require another paid attempt; store or network outages may still delay recovery. Without AI configuration the game uses canonical dialogue. There is no per-question consent; the landing page and lobby report the server's current dialogue mode, explaining authored topic-matched replies when AI is off and AI voices with authored fallback when it is on. See [AI orchestration](docs/AI_ORCHESTRATION.md) and [local AI](docs/LOCAL_AI.md).
- Deductions are listed per case, each with sources (`{suspectId, topic}`) and a key flag. They are individual: each player sees only their own unlocks. A canonical answer on a listed topic unlocks its sourced deductions, and the AI may only unlock deductions of the suspect being interviewed.
- Your private notebook lives in Deductions: review every interview and follow a deduction back to the exact answer that unlocked it. Reviews never consume questions, remain available before the summons and after the reveal, and keep earlier unsent drafts labelled by turn. Notebook location and drafts recover on the same browser when storage is available; server-held testimony still requires a connection and a room that has not expired.
- Switch rooms from the lobby or Case file without deleting your seat or private drafts. Invitations to another room ask before leaving the current table. Return to your previous seat from the landing screen, or enter its code again on the same browser while the room remains available. Switching does not pause the game; an absent host may be replaced after two minutes.
- Eight-character invitations and cookie-based browser identity. Idempotent commands and transactional DynamoDB adapters preserve safe retries.
- Rooms expire after six hours without actions or 24 hours from creation. Polling does not renew them.
- Removed from earlier builds: the shared team board, evidence sharing, notes, correlations, the topic selector, the consent checkbox, board search and the case-film dialog.

**Azure staging has been deployed and hosted AI verified for the release recorded above; the retained AWS AI deployment path remains disabled by default.** The collaborator’s editorial case and solution remain private. The public demo is separate and spoiler-visible in source; automated screenshots use synthetic content. Playtesting is still needed to assess pacing and difficulty.

## Local development

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev:demo
```

Open http://127.0.0.1:3000. This is a synthetic technical fixture, not the editorial mystery. Use three separate browser profiles or contexts to represent three players; ordinary tabs share identity.

For the authorised private English case, place the complete versioned module at `private/train-case.en-GB.mjs`, then run `npm run dev`. Alternatively set `SHIFT_CASE_FILE` explicitly when running `npm start`. The original-language source need not be overwritten. Private modules export `TRAIN_CASE` and `CASES`, and the entire `private/` directory is ignored by Git. The chat redesign made the case format stricter: until the private case gains a `brief` for every suspect and a case-level `deductions` list (6–20 entries, at least 3 marked `key: true`), `npm run dev` refuses to load it. `clockStart` is optional and defaults to 20:00. See [case authoring](docs/CASE_AUTHORING.md) for the exact shape; `SHIFT_CASE_FILE=private/train-case.en-GB.mjs npm run check:case` validates it without starting the server.

Without `SHIFT_TABLE`, local rooms are in memory and disappear when the server restarts. Production requires durable storage, HTTPS, origin verification and a pinned private case artefact. Changing a case version must not silently reinterpret existing rooms.

## Verification

```sh
npm test
npm run check
npm audit --omit=dev
npm run package
```

The build contains an exact allowlist of public assets, four separate Lambda bundles and third-party notices. It excludes private cases, tests, development screenshots, credentials and arbitrary files in `public/`. Previous build output is preserved under `dist.previous-*`, outside the deployment directory; never publish those folders.

The client is vanilla JavaScript modules (`app`, `api`, `views`, `chat`, `toast`, `backdrop`, `ui-state`) with no framework. The three atmosphere films (about 2.0 MiB with about 72 KiB of posters) play as muted, looped backgrounds with no audio track; under reduced motion only the poster shows. A PWA manifest lets phones install the game; there is no service worker, so nothing works offline. Static media is served with `Cache-Control: public, max-age=86400`. Rye is self-hosted with its SIL OFL notice, with system fonts used for reading and controls.

See [UI validation](docs/VALIDATION_UI.md), [backend English validation](docs/BACKEND_EN_GB_VALIDATION.md), [interface design](docs/UI_DESIGN.md), [background films](docs/CASE_FILMS.md), [deployment guidance](docs/DEPLOYMENT.md), [AI orchestration](docs/AI_ORCHESTRATION.md), [credits](AI_AND_CREDITS.md) and [licensing status](LICENSE_STATUS.md).

## Public playable demo (spoilers in source)

Run `npm run dev:public-demo` for a separate authored demo mystery. This does not load or replace the private editorial case, activate AI, or deploy anything. `npm run dev:demo` still uses the deliberately artificial test fixture. Run `npm run check:public-demo` for structural validation.

Play in three or four separate browser profiles/contexts to keep player sessions isolated. The server stays on loopback by default; no hosted or phone-accessible session is created. Each player works through their own interviews and deductions.

Players should avoid `examples/public-demo.mjs` and its companion notes until after playing: this public demo intentionally ships its solution in source. The HTTP game projection still withholds it until the reveal. Scripted route tests prove that specified evidence can be reached within the rules, **not** that all choices solve the case or that human playtesting has passed. See [spoiler-labelled author notes](examples/public-demo-notes.md) for the clue map and playtest questions.

### Scripted public-demo browser check

`npm run test:browser` runs both synthetic recovery coverage and a three-phone Chromium playthrough of the public demo. The latter uses a known authored route through ordinary UI controls, including private chat interviews, deduction toasts, waiting for the other players, the host advancing past an absent player, the time-is-up screen, accusations and the reveal. It checks integration and privacy, not blind discovery, narrative quality or enjoyable difficulty. An unspoiled human playtest is still needed. No AI calls or hosted deployment are involved.

### Azure staging migration

The opt-in Azure entry point uses PostgreSQL transactions and managed identity; existing AWS deployment paths are retained. See [Azure deployment and bootstrap](docs/AZURE_DEPLOYMENT.md) for prerequisites, costs, private networking and readiness gates. `npm run package:azure` builds an allowlisted server bundle with the **public development demo only**. It does not provision resources, copy credentials or enable paid AI. Azure staging is already active as recorded above. Further releases require their own approved deployment and verification; packaging alone does not change the live service.
