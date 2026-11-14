# Permanent private case release design

## Intent and authorised scope

Integrate the reviewed six-case bilingual code while ensuring future main CI
releases cannot silently revert to the museum-only demo. Preparation includes
source, offline tests and real ephemeral PostgreSQL validation. The coordinator
owns PR/merge/release decisions. No room deletion, Azure upload, configuration,
credentials, IAM or paid-resource change is executed by this implementation task.

The fetched main is still c5b1bfc and is an ancestor of 9b755ea. Integration branch
`feat/private-release-integration` preserves all existing main/Arthur work.

## Approach

The existing public CI artifact remains a tested code package with only the public
museum. The main-only deployment job, after its existing OIDC login, downloads an
immutable private JSON blob from the existing fixed SHIFT releases container.
A reviewed public pointer records only its SHA-256, byte size and expected counts.
The helper verifies the private container and blob metadata, downloads with Entra
login, verifies hash and complete case schema, then replaces exactly the private
JSON and case-manifest entries in the verified public ZIP. All other packaged
files remain byte-for-byte identical. The hydrated ZIP is never uploaded to GitHub
Actions artifacts; it flows directly to the existing private Azure release helper.

Alternatives considered: publishing private cases in Git/Actions would disclose
solutions; rebuilding the complete package after fetch would weaken the link to
the already-tested immutable code artifact. Hydrating only the two declared data
entries preserves that link without new dependencies, secrets or permissions.
This implementation choice follows the user's existing instruction to proceed
without routine design questions.

## Contract

- Fixed subscription/account/container remain those in azure-ci-deploy.py.
- Blob name is `case-libraries/<sha256>.json`; arbitrary URLs/SAS are not accepted.
- `config/private-case-release.json` contains format, SHA-256, byte size, six
  current cases and six Portuguese translations; no narrative or private names.
- Reads use `--auth-mode login`, fail closed, and never fall back to account keys.
- A denied/missing/oversized/changed blob, invalid schema, unexpected count,
  corrupt ZIP or mismatched artifact hash aborts before deployment.
- CLI stdout/stderr, exception strings and story data never appear in logs.
- Temporary JSON and hydrated ZIP have restrictive permissions and are cleaned up.
- No museum fallback is allowed in the authenticated deployment path.
- Existing settings, AI policy and durable room data remain unchanged.

## Operational gates

The cloud has no Azure CLI/runtime identity, so access to the existing private
container and live room/job inventory cannot be proven here. The coordinator must
verify the exact existing identity's access and the immutable source blob before
merge/deployment. No new grant or resource is an automatic workaround. A later
room deletion requires its own concrete inventory and approval; this change does
not add a deletion path or invalidate existing rooms.
