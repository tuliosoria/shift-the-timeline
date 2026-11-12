# Optional local OpenAI dialogue

This is a local development trial, not a deployment. Normal `npm start`, the Lambda API, AWS workers and CI remain AI-disabled. Never put a key in GitHub, source, browser code or CI artifacts. A GitHub Actions secret is not a running game's secret store. The existing future AWS worker supports a separately approved Secrets Manager secret containing `apiKey`; this trial neither provisions nor activates it.

## Explicit setup

Use an existing key in a private, user-owned, non-symlink file outside the repository. The file contains only `OPENAI_API_KEY=...` and has mode 0600. `SHIFT_LOCAL_AI_KEY_FILE` points to that file; the server reads it lazily without changing its environment or exposing it to players. Do not paste credentials into chat or commands.

Set these **nonsecret** configuration variables before `npm run dev:ai`:

- `SHIFT_LOCAL_AI_ENABLED=true` and `SHIFT_LOCAL_AI_CONSENT=true`: operator approval for the trial (this is the operator's consent, not a player prompt).
- `SHIFT_ORIGIN=http://127.0.0.1:3000`: only HTTP loopback origins are accepted. No LAN/public hosting.
- `SHIFT_CASE_FILE=tests/fixtures/case.mjs`: synthetic data first. Only use trusted authored modules; importing JavaScript runs it.
- `SHIFT_LOCAL_AI_KEY_FILE`: absolute private credential-file path.
- `SHIFT_LOCAL_AI_MODEL`: exact available model, for example `gpt-6-luna` after access verification.
- `SHIFT_LOCAL_AI_INPUT_RATE` and `SHIFT_LOCAL_AI_OUTPUT_RATE`: independently verified current USD per million tokens. No guessed/default pricing.
- `SHIFT_LOCAL_AI_MAX_CALLS`: an explicit integer 1–12.
- `SHIFT_LOCAL_AI_MAX_RESERVE_MICROUSD`: explicit worst-case per-process allowance, at most 250000 microUSD ($0.25).

The trial fixes the room limit at 250000 microUSD and the per-call envelope at 6000 input and 1024 output tokens. These local bounded limits are distinct from the currently approved uncapped Azure production policy; this trial does not change the hosted policy. Locally the day and month limits equal your reserve allowance and calls run one at a time. On start the trial checks that a full room of 48 questions (4 turns, 3 questions, 4 players) fits the room limit at the selected prices, and refuses to run otherwise. The reserve allowance must also cover one 6000-input/1024-output-token reservation at those prices.

These are per-process trial bounds, **not** account-wide billing controls. Restarting the process resets them; running multiple processes multiplies them. The attempted-request count and full reservation are never refunded, even for timeouts/errors. Understated or stale model prices invalidate the dollar estimate; the hard request/token caps still apply. No retries of uncertain generation calls.

## What players see and what is sent

There is no per-question consent. The landing page and lobby report the server's dialogue mode, and players should not enter personal information. Each admitted question sends the selected suspect's brief and four canonical responses, public case facts, the new question and up to eleven complete or canonical exchanges with that same suspect from the same player and room, including earlier turns. Pending answers are excluded at admission. Whole exchanges may be omitted to fit the complete 16,000-byte storage Item with lifecycle headroom; they are never summarised into new facts. The question and authorised facts are not shortened. Only this suspect's unearned deductions are award candidates, alongside the player's already-earned IDs scoped to that suspect. Other players' conversations, other suspects' briefs, session credentials and the global solution object are excluded. A culprit's own brief can contain hidden truth. The request uses `store:false`, which is not a claim of zero provider retention.

The model returns `{reply, unlocked}`: the in-character reply and the ids of deductions the question earned. The server accepts only deductions belonging to the interviewed suspect.

AI text is voice, not an authority over outcomes: the outcome is computed from accusations and the case. Instructions constrain the model but cannot guarantee it never invents a detail, so players should treat replies as testimony from a suspect who may lie. On any failure, timeout, budget refusal or stopped worker the question is answered with the canonical answer and canonical deductions, so play continues.

The private editorial case has not been available for validation. Synthetic tests do not establish narrative readiness. The local trial does not make the production game AI-enabled or solve the missing private-case handoff.
