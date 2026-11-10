# Optional local OpenAI narration

This is a local development trial, not a deployment. Normal `npm start`, the Lambda API, AWS workers and CI remain AI-disabled. Never put a key in GitHub, source, browser code or CI artifacts. A GitHub Actions secret is not a running game's secret store. The existing future AWS worker supports a separately approved Secrets Manager secret containing `apiKey`; this trial neither provisions nor activates it.

## Explicit setup

Use an existing key in a private, user-owned, non-symlink file outside the repository. The file contains only `OPENAI_API_KEY=...` and has mode0600. `SHIFT_LOCAL_AI_KEY_FILE` points to that file; the server reads it lazily without changing its environment or exposing it to players. Do not paste credentials into chat or commands.

Set these **nonsecret** configuration variables before `npm run dev:ai`:

- `SHIFT_LOCAL_AI_ENABLED=true` and `SHIFT_LOCAL_AI_CONSENT=true`: operator approval for the trial.
- `SHIFT_ORIGIN=http://127.0.0.1:3000`: only HTTP loopback origins are accepted. No LAN/public hosting.
- `SHIFT_CASE_FILE=tests/fixtures/case.mjs`: synthetic data first. Only use trusted authored modules; importing JavaScript runs it.
- `SHIFT_LOCAL_AI_KEY_FILE`: absolute private credential-file path.
- `SHIFT_LOCAL_AI_MODEL`: exact available model, for example `gpt-6-luna` after access verification.
- `SHIFT_LOCAL_AI_INPUT_RATE` and `SHIFT_LOCAL_AI_OUTPUT_RATE`: independently verified current USD per million tokens. No guessed/default pricing.
- `SHIFT_LOCAL_AI_MAX_CALLS`: an explicit integer1–12.
- `SHIFT_LOCAL_AI_MAX_RESERVE_MICROUSD`: explicit worst-case per-process allowance, at most250000microUSD ($0.25). It must cover one2500-input/350-output-token reservation at the selected prices.

These are per-process trial bounds, **not** account-wide billing controls. Restarting the process resets them; running multiple processes multiplies them. The attempted-request count and full reservation are never refunded, even for timeouts/errors. Understated or stale model prices invalidate the dollar estimate; the hard request/token caps still apply. No retries of uncertain generation calls.

## Player choice and evidence

Each question offers an unchecked opt-in. Only that question, its fictional suspect profile and canonical answer may go to OpenAI, with `store:false`. No other interviews, session credentials or full solution are sent. `store:false` is not a claim of zero provider retention. Unchecked questions remain local and receive the same canonical evidence. Do not enter personal information.

AI text is optional voice, never authoritative evidence. Canonical answers remain unchanged and sharing still publishes only canonical evidence. Instructions constrain narration but cannot guarantee a model will never invent a fact; players must ignore voice as evidence. Failure, timeout, budget exhaustion or stopping the worker preserves canonical gameplay. Consent is required again for each new question; safe retries retain the original question's consent.

The private editorial case has not been available for validation. Synthetic tests do not establish narrative readiness. Local trial does not make the production game AI-enabled or solve the missing private-case handoff.
