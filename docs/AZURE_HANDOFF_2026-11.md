# Azure handoff: mobile chat redesign (action needed by Arthur)

**Status:** the mobile chat redesign (4 turns × 6 hours, AI-voiced suspects, unlockable deductions, new client) is on `main` and auto-deploys through the `deploy-azure` job. That job **does not change App Service configuration**, and two live settings predate the redesign. The first deploy could not start because of them. The server now tolerates both, so the site runs. It logs a fixed `azure_startup_notice` line for each one until Arthur updates the settings below. **This is no longer urgent, but it is needed to switch AI back on.**

Current tolerance (added after the first failed deploy):
- **Stale `SHIFT_AI_POLICY`**: AI is switched off (canonical answers) and the server logs `{"event":"azure_startup_notice","reason":"ai_policy_invalid"}`. It no longer exits. Missing consent or key is still fatal.
- **Stale `SHIFT_CASE_SHA256`**: the server accepts the case only if its digest matches the `case-manifest.json` in the same verified release package, and logs `{"event":"azure_startup_notice","reason":"case_pin_superseded"}`. Any other mismatch is still rejected.

## What the settings are out of date about

1. **Case pin.** `SHIFT_CASE_SHA256` pins the public-demo case bytes. The Bracken Quay case was rewritten (suspect briefs, deductions, `clockStart: '18:00'`), so its digest changed. Without the package-manifest tolerance it would be rejected (`Case integrity mismatch`).
2. **AI policy.** The live app has AI enabled with the old policy envelope (2,500/350 tokens, old limits). The new code accepts only 6,000/400 tokens and the new limits; `readAzureConfig` treats the old policy as invalid and switches AI off.

## Steps (in this order)

Use the explicit subscription `ddb0b48c-aa74-4420-bf1b-49a3f7eaa970`, group `rg-shift-playtest-centralus`, app `shift-zndzouh3e74wy`. Never print or paste secrets.

1. **Turn AI off explicitly** (the server is already canonical; this makes it intentional):
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

## Temporary existing-identity diagnostic

`scripts/azure-ai-diagnostic.py` is a read-only diagnostic in the existing
post-validation, main-only deployment job. It reuses that job's current Azure
identity and requests app settings only for the fixed SHIFT subscription, resource
group and app. It adds no OIDC permission, credential, grant, setting write or AI
request. A branch/PR validation run tests the helper offline; it does not run the
authenticated diagnostic.

Output is a fixed-schema summary: known boolean flags, allowlisted numeric policy
fields, whether the model is the known Luna model, and credential presence/type.
Unknown strings, credential values, Key Vault references, raw CLI responses and
exception messages are never printed. A denied, malformed or unavailable read
produces only `azure_ai_diagnostic` / `unavailable` and is not retried. Do not grant
additional permissions to make it pass.

A successful read does not prove settings-write permission or access to the
resolved Key Vault secret. It cannot restore AI or perform its paid evaluation.
Merging this diagnostic still runs the existing automatic deployment workflow;
review and explicitly authorize that particular deployment before merging. Remove
the temporary workflow step after the investigation; preserve useful offline tests.
