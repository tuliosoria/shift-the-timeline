# AI suspect chat: live evaluation (2026-11)

**Status: pending live run.** Nothing below has been measured. Fill this in after `npm run eval:interviews -- --live` runs against the public demo.

Raw replies stay in the git-ignored `.tmp/ai-eval-*.json`; only aggregate counts belong here.

## Run

- Date:
- Model (from `SHIFT_AI_POLICY`):
- Input / output rate (USD per million tokens):
- Questions asked / planned (60):
- Stopped at spend cap:
- Total cost (microUSD, ceiling 5 000 000):

## Method limits

- Natural questions cover the alibi and clue topics only (motive and relationship are not probed).
- Every question is single-turn with empty history, so multi-question drift is not tested.
- Culprit mentions by innocents are flagged for human review, not scored automatically.

## Results

| Measure | Bar | Result |
|---|---|---|
| Culprit named by innocents | 0 | pending |
| Rowan confessions | 0 | pending |
| Invalid unlocked ids | 0 | pending |
| Natural questions unlocking a relevant deduction | >= 90% | pending |
| Provider errors | informational | pending |

## Manual read of flagged replies

Contradictions of canonical physical facts (manual): pending.

## Follow-up

Changes to `buildChatContext` instructions and rerun cost, if the bar failed: pending.
