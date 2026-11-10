# SHIFT: The Timeline

A cooperative investigation game in British English for 3–4 players. A crime is foretold; the team splits private interviews, shares evidence, connects findings and makes individual accusations.

## Current development build

The investigative interface follows **Analyse → Interrogate → Deduce**. It includes illustrated dossiers, a compact mobile layout, explicit sharing previews, structured team hypotheses and a confirmed end-of-round action.

- Authoritative rules: 15 suspects, three rounds, one suspect per player per round, up to four questions per interview.
- Eight-character invitations and cookie-based browser identity.
- Private interviews and ballots. Only explicitly shared canonical answers enter the team board.
- Freeform questions keep their wording. Automatic topic matching remains the default; an optional topic selector lets you direct a question to the intended canonical evidence without replacing it with a preset prompt.
- Before accusing, review your private interview history and explicitly share canonical answers without reopening questioning. Unshared interviews stay private.
- Correlations reference public case facts, suspect dossiers or already-shared evidence. They remain unverified player hypotheses.
- Local drafts survive stage changes, polling and reload in the same browser context. Unsent earlier-round drafts stay labelled and recoverable rather than moving into a new interview.
- Idempotent commands and transactional DynamoDB adapters preserve safe retries.
- Rooms expire after six hours without actions or 24 hours from creation. Polling does not renew them.
- Canonical dialogue by default. A separately opted-in, bounded local OpenAI narration trial is available; hosted AI remains disabled. See [local AI](docs/LOCAL_AI.md).

**No deployment or live AWS configuration has been performed for this UI release.** The collaborator’s editorial case and solution remain private. The new optional public demo is separate and spoiler-visible in source; existing automated screenshots use synthetic content. Playtesting is still needed to assess pacing and difficulty.

## Local development

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev:demo
```

Open http://127.0.0.1:3000. This is a synthetic technical fixture, not the editorial mystery. Use three separate browser profiles or contexts to represent three players; ordinary tabs share identity.

For the authorised private English case, place the complete versioned module at `private/train-case.en-GB.mjs`, then run `npm run dev`. Alternatively set `SHIFT_CASE_FILE` explicitly when running `npm start`. The original-language source need not be overwritten. Private modules export `TRAIN_CASE` and `CASES`, and the entire `private/` directory is ignored by Git.

Without `SHIFT_TABLE`, local rooms are in memory and disappear when the server restarts. Production requires durable storage, HTTPS, origin verification and a pinned private case artefact. Changing a case version must not silently reinterpret existing rooms.

## Verification

```sh
npm test
npm run check
npm audit --omit=dev
npm run package
```

The build contains an exact allowlist of public assets, four separate Lambda bundles and third-party notices. It excludes private cases, tests, development screenshots, credentials and arbitrary files in `public/`. Previous build output is preserved under `dist.previous-*`, outside the deployment directory; never publish those folders.

The 18 browser illustrations total approximately 634 KiB. Rye is self-hosted with its SIL OFL notice, with system fonts used for reading and controls. No framework or new runtime service was introduced.

See [UI validation](docs/VALIDATION_UI.md), [backend English validation](docs/BACKEND_EN_GB_VALIDATION.md), [interface design](docs/UI_DESIGN.md), [deployment guidance](docs/DEPLOYMENT.md), [AI orchestration](docs/AI_ORCHESTRATION.md), [credits](AI_AND_CREDITS.md) and [licensing status](LICENSE_STATUS.md).

## Public playable demo (spoilers in source)

Run `npm run dev:public-demo` for a separate authored demo mystery. This does not load or replace the private editorial case, activate AI, or deploy anything. `npm run dev:demo` still uses the deliberately artificial test fixture. Run `npm run check:public-demo` for structural validation.

Play in three or four separate browser profiles/contexts to keep player sessions isolated. The server stays on loopback by default; no hosted or phone-accessible session is created. Share interview answers deliberately and use the team board to assemble the argument.

Players should avoid `examples/public-demo.mjs` and its companion notes until after playing: this public demo intentionally ships its solution in source. The HTTP game projection still withholds it until the reveal. Scripted route tests prove that specified evidence can be reached within the rules, **not** that all choices solve the case or that human playtesting has passed. See [spoiler-labelled author notes](examples/public-demo-notes.md) for the clue map and playtest questions.

### Scripted public-demo browser check

`npm run test:browser` runs both synthetic recovery coverage and a three-player Chromium playthrough of the public demo. The latter uses a known authored route through ordinary UI controls, including private interviews, explicit sharing, a correlation, all-player round completion and accusations. It checks integration and privacy, not blind discovery, narrative quality or enjoyable difficulty. An unspoiled human playtest is still needed. No AI calls or hosted deployment are involved.
