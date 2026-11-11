# Azure handoff: mobile chat redesign (action needed by Arthur)

**Status when this was pushed:** the mobile chat redesign (4 turns × 6 hours, AI-voiced suspects, unlockable deductions, new client) was merged to `main`. The push auto-deploys through the `deploy-azure` job, which **does not change App Service configuration**. Two live settings no longer match the new build, so **the new build cannot start until they are changed**. The site is expected to be down (start-up failure/restart loop) until the steps below are done. The owner has no Azure login; Arthur needs to connect to Azure and apply them.

## Why it fails to start

1. **Case pin.** `SHIFT_CASE_SHA256` pins the public-demo case bytes. The Bracken Quay case was rewritten (suspect briefs, deductions, `clockStart: '18:00'`), so its digest changed. `readPinnedCase` rejects the mismatch (`Case integrity mismatch`).
2. **AI policy.** The live app has AI enabled with the old policy envelope (2,500/350 tokens, old limits). The new code accepts only 6,000/400 tokens and the new limits; `readAzureConfig` rejects the old policy (start-up diagnostic reason `ai_policy_invalid`).

## Steps (in this order)

Use the explicit subscription `ddb0b48c-aa74-4420-bf1b-49a3f7eaa970`, group `rg-shift-playtest-centralus`, app `shift-zndzouh3e74wy`. Never print or paste secrets.

1. **Turn AI off** so the policy is not validated:
   `SHIFT_AI_ENABLED=false`
2. **Update the case pin** to the new public-demo digest:
   `SHIFT_CASE_SHA256=b7f54d17a7413032ffd9c3eaf66faffa2ab5e1b065902cd4d15dfaccabdc342b`
   Cross-check it against the `Azure public-demo staging package ready. Case SHA256: …` line in the CI `validate` job log for the deployed commit, and against `case-manifest.json` inside the release artifact. If they differ, use the CI value.
3. Read both settings back, let the app restart, then verify:
   - `GET /healthz` → `ok`
   - `GET /api/release` → the current `main` commit
   - `GET /api/cases` → `dialogueMode: "canonical"`, case `bracken-quay-demo`
   - Play one turn on a phone.
4. **Later, to switch AI back on** (only after the paid live evaluation in `docs/evidence/ai-chat-2026-11/README.md` passes): follow "Updating SHIFT_AI_POLICY" in `docs/AZURE_DEPLOYMENT.md`. Set the new `SHIFT_AI_POLICY` first (keep the current `model`, `inputRate` and `outputRate`), read it back, and then set `SHIFT_AI_ENABLED=true`. Confirm that `/api/cases` reports `dialogueMode: "ai"`.

## Notes

- Rooms created before the deploy are rejected (`Case version unavailable.`) and the client sends those players back to the landing screen. Players create a new room.
- Future case content changes need the same pin update. Consider making the deploy job update `SHIFT_CASE_SHA256` from the artifact's `case-manifest.json`, so that `main` pushes cannot strand the app.
- Design and plan: `docs/superpowers/specs/2026-11-10-mobile-chat-redesign-design.md` and `docs/superpowers/plans/2026-11-10-mobile-chat-redesign.md`.
