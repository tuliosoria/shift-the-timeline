# Private release integration implementation plan

> **For agentic workers:** Use superpowers:executing-plans. The user authorised Astra implementation and independent review without routine questions.

**Goal:** Make every authorised main deployment hydrate its tested code package with the pinned private bilingual case library.
**Architecture:** Fixed private blob and public digest/count pointer; existing OIDC identity; fail-closed data-only ZIP hydration after public CI checks.
**Tech Stack:** Python standard library, existing Node case validator, Azure CLI and current GitHub Actions.
**Spec:** ../specs/2026-11-14-private-release-design.md

## Global constraints

No Azure mutations, permission/configuration changes, paid providers, room deletion,
merge or deployment during preparation. Preserve current code artifact and all
canonical case pins. No private narrative in public Git or Actions artifacts/logs.

## Review focus

- Missing/denied blob must abort without public-demo fallback.
- Corrupt/oversized/private payload must never be echoed by error handling.
- Hash/ETag mismatch and arbitrary blob targets must be rejected.
- ZIP code bytes and release commit remain unchanged after hydration.
- Public CI/PR jobs never acquire private content or expanded Azure permissions.

### Task 1: Verified private data hydration

Files: scripts/azure-private-case.py, scripts/verify-case-release.mjs,
config/private-case-release.json, tests/test_azure_private_case.py,
tests/case-release.test.mjs.
- [x] Write synthetic failures for pointer bounds, fixed targeting, denied reads,
  size/hash/ETag mismatch, schema/count failures and ZIP entry preservation.
- [x] Implement bounded fixed-target reads and generic diagnostics.
- [x] Validate JSON using existing Node schema without printing case errors.
- [x] Hydrate only private/case.json and case-manifest.json; verify output ZIP.
- [x] Run focused Python/Node checks and real local package hydration offline.

### Task 2: Workflow and operator handoff

Files: .github/workflows/ci.yml, docs/CASE_LIBRARY.md, docs/AZURE_DEPLOYMENT.md.
- [x] Add hydration after existing main-only OIDC login, before deployment.
- [x] Keep public artifact uploads unchanged and clean private temporary output.
- [x] Add workflow regression assertions and document exact upload/readback gate.
- [x] Confirm no changes to IAM, credentials, provider policy or room state.

### Task 3: Integration validation

Files: tests/postgres-integration.test.mjs, private validation notes.
- [x] Exercise translated preferences/replay in real ephemeral PostgreSQL.
- [x] Run Node/Python/syntax/package checks and CI with PostgreSQL.
- [x] Obtain independent review, fix findings, commit/push reviewable branch.
- [x] Report merge blockers: immutable private blob/access proof and any CI issue.

## Validation and remaining operational gates

Independent review cleared helper, workflow, SQL, documentation and new PostgreSQL
coverage. Local checks: four focused Node tests, seven focused Python tests;
complete suites 605 Node passes with the unchanged cloud ownership failure and
one PostgreSQL skip in that run, 32 Python passes, syntax checks, public Azure
package and exact-private-data hydration with a fake Azure transport. A separate
real ephemeral PostgreSQL 16 run passed all 27 tests, including bilingual pending
job/replay persistence and read-only inventory. No live provider or Azure call.

Baseline PR CI run 43636212662 passed validation and real PostgreSQL. The final
integration commit triggers a new run; the coordinator must verify that exact
head before merge. Implementation review is complete, but merge/deployment stays
blocked until the private blob/access path and required release inputs are proven.
No Azure upload, live inventory or deletion was performed. Existing room pins are
preserved; deleting rooms is not a prerequisite for this integration.
