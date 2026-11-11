# Azure handoff: active hosted AI and release reference

## Verified release receipt: 11 November 2026

[PR #48](https://github.com/tuliosoria/shift-the-timeline/pull/48) is merged and deployed as `370ab445f624a45d9d0b3ba212a3bebc8bf9633e`. [Main CI and deployment](https://github.com/tuliosoria/shift-the-timeline/actions/runs/43105541051) passed; live `/healthz` returned HTTP 200 and `/api/release` matched that exact commit. Six actual hosted AI replies in an isolated three-player game passed independent factuality, deduction and privacy review. This verifies that release, not subsequent changes or arbitrary player questions. It is not a browser-reconnect or load-test result.

The active model is `gpt-6-luna`, with explicit medium reasoning and a **6,000-input/1,024-output-token envelope**. Output allowance includes reasoning as well as visible JSON. The approved production policy remains **uncapped**: `uncapped:true`, room/day/month financial limits all `null`, and concurrency **2**. The restore did not change credentials or security permissions. No case-pin or AI-policy update is currently requested by this handoff.

The mobile chat rules are four turns of six hours, three questions per turn, private interviews and unlockable deductions. The landing page and lobby describe the active dialogue mode; there is no per-question consent checkbox. Failed or unadmitted AI questions use authored fallback without an automatic paid retry. See [AI orchestration](AI_ORCHESTRATION.md) for exact provider scope, privacy and quality limitations.

## Future release checks

The main-only `deploy-azure` job deploys after validation when its repository enable variable is true. A main merge can therefore deploy automatically; treat release approval separately from code review. The job does not change App Service configuration. Packaging or merging code alone is not permission to change financial policy, credentials or security settings.

For an authorised release, verify the exact tested commit, successful deployment, `/healthz`, `/api/release` and `/api/cases` dialogue mode. Mode metadata alone does not prove a successful model call. Any fresh paid evaluation needs its own authorised scope and allowance; a test allowance does not replace the uncapped production policy. Record its actual results separately, including untested behaviour and remaining quality limitations.

The [Azure deployment runbook](AZURE_DEPLOYMENT.md) describes policy compatibility and rollback. Read the existing non-secret policy before any separately authorised correction, preserve its financial mode, model, rates and concurrency, and never print credentials or raw app-setting responses. Do not replay the historical cold-start remediation below against a working deployment.

## Historical cold-start issue: reference only

The first mobile chat redesign encountered a stale public-demo case pin and the older 2,500/350-token AI policy. Earlier versions of this document asked the operator to turn AI off and update settings. Those instructions are superseded by the verified release receipt above and are **not outstanding operational work**.

The compatibility behaviour remains useful for diagnosis:

- A stale or invalid `SHIFT_AI_POLICY` causes canonical dialogue and the fixed notice `{"event":"azure_startup_notice","reason":"ai_policy_invalid"}`. Current Azure builds do not construct a provider or admit paid jobs in that state. Missing required operator consent or an unavailable credential remains a configuration error.
- If `SHIFT_CASE_SHA256` is stale, the case is accepted only when its digest matches `case-manifest.json` in the same verified release package. The fixed notice is `{"event":"azure_startup_notice","reason":"case_pin_superseded"}`. An unrelated mismatch is still rejected. Do not substitute a digest copied from an old handoff for the exact release manifest.
- Rooms whose case version is unavailable are rejected rather than silently interpreted using another case; players must create a compatible room.

Design history: `docs/superpowers/specs/2026-11-10-mobile-chat-redesign-design.md` and `docs/superpowers/plans/2026-11-10-mobile-chat-redesign.md`. Historical design plans are not live configuration receipts.

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
resolved Key Vault secret. It cannot itself change AI configuration or perform a paid evaluation.
The diagnostic remains part of the existing automatic deployment workflow. Any
removal should be reviewed as a source change, preserving useful offline tests;
its presence is not evidence that additional settings or permissions are needed.
