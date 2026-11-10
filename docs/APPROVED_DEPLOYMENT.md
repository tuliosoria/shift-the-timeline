# Approved deployment scope

Approved on 10 November 2026. This document records the scope and controls for the first playable release. Approval is not evidence that deployment or paid-provider verification has happened.

## Destination and architecture

- Public game: `https://shift.terminalufo.com`.
- Separate SHIFT resources in the owner's AWS account, in `us-east-1`.
- CloudFront, TLS certificate, WAF and DNS for the game subdomain.
- Private S3 buckets for public release assets and the private case, with distinct access policies. Deployment packages use a separate private artifact location.
- API Gateway, an authoritative API Lambda and DynamoDB persistence.
- Three separate AI functions: worker, outbox relay and reconciler, with SQS and dead-letter queues.
- Six operational alarms in the AWS console. External notification recipients are not configured by this release.
- No Lambda quota increase, reserved concurrency, permission to modify unrelated applications, or public access to the case package.

## Approved cost scope

OpenAI narration uses `gpt-6-luna`, standard service tier and `reasoning.effort=none`.

| Application limit | Amount |
| --- | ---: |
| Per room | US$ 0.25 |
| Per UTC day | US$ 5.00 |
| Per UTC month | US$ 25.00 |
| Concurrent admitted provider calls | 2 |
| Maximum input envelope per call | 2,500 tokens |
| Maximum output per call | 350 tokens |

Paid launch checks count towards these limits. Jobs reserve their maximum estimated cost before admission, in the same transaction as the question. Unknown provider outcomes retain the reservation and are not called again. Missing/corrupt budgets, invalid policy and exhausted allowance fall back to the canonical answer.

The reviewed standard model prices on the approval date are US$ 0.10 per million uncached input tokens and US$ 0.50 per million output tokens. The deployment policy uses US$ 0.125 per million for **all input tokens** to conservatively cover the documented cache-write rate. At the maximum token envelope, the application reserves 488 microdollars per call. It does not assume discounts. Prices and model availability must be checked again before launch.

Sources: [model and rates](https://developers.openai.com/api/docs/models/gpt-6-luna), [pricing](https://developers.openai.com/api/docs/pricing).

AWS has an approved **estimate of US$ 10–25 per month for the beta, with no guaranteed billing ceiling**. It is usage-based and may differ from the estimate. WAF, API throttles and application limits reduce exposure but do not guarantee a bill. The OpenAI application counters do not limit other uses of the same credential or guarantee the provider's account-wide bill. Billing alerts and provider-account settings are separate from these counters.

## Credential separation

The first release uses the AWS owner's own OpenAI API credential temporarily. A collaborator's credential is not required.

- Planned protected storage: `shift/production/openai`, containing the `apiKey` field. The key must be entered through a secure setup flow, never in chat, Git, screenshots, CloudFormation parameters or logged commands.
- Only the SHIFT AI worker receives `GetSecretValue` permission for the exact approved OpenAI secret ARN. The API, relay, reconciler and browser do not receive this credential.
- A different secret, planned as `shift/production/origin`, contains a 64-character random hexadecimal `token` for verifying requests from CloudFront. It is not an OpenAI credential.
- The API may read only its origin secret and pinned private case artifact. CloudFront uses the origin token through a secret reference.
- Values, existing credentials from unrelated applications and broad KMS decrypt permissions are not part of the repository or deployment parameters. A customer-managed KMS key would need its own permission review.
- Confirm actual secret locations, AWS identity and execution roles before applying a change set. Do not silently copy a key from another service or substitute a collaborator's key.

The user approved secure AWS storage, separation and worker-only credential use. A secure source for the actual key must still be available before configuration can finish.

## Player data and game integrity

The game is playable without OpenAI. The interface offers narration only when `/api/cases` advertises `dialogueMode: ai_optional`.

The checkbox starts unchecked and is scoped to one interview. It is not restored from storage or carried into another round. A submitted question includes `aiConsent: true` only if the player selected it. A pending retry retains the exact original body and ID; changing consent under the same ID is rejected rather than silently changing a prior submission.

Only the question, fictional suspect persona and relevant canonical answer are sent to OpenAI. Players are told not to enter personal information. The global solution, other players' conversations and accusations are excluded. `store: false` does not promise zero retention by OpenAI.

AI voice is labelled and private to the interview owner. It is not evidence. Sharing a clue sends the canonical answer, never the generated voice. Structured output and prompts reduce risk but do not prove narrative consistency or remove hallucination; provider evaluation remains necessary.

## Activation and release gates

`AllowNewRooms=false` and `EnableAi=false` are the safe defaults. `EnableAi` controls admission, AI runtimes, queue/stream mappings and the reconciliation schedule together. Provisioning resources does not independently activate AI.

Before launch:

1. Verify the current AWS identity, region, quota, domain records and certificate. Do not change other projects or increase quota.
2. Verify the release commit, CI, artifact allowlist and hashes. Keep the full case package out of Git and out of the web-assets bucket.
3. Configure the approved secrets securely and review the exact IAM and CloudFormation change set.
4. Deploy with new rooms and AI paused, then upload public assets and the private case to their distinct destinations.
5. Verify HTTPS, headers and direct-origin rejection first. Briefly enable new-room creation to seed bounded test rooms, then pause new rooms again while checking durable storage, independent player sessions, privacy and retries. Existing test rooms remain usable while admission is paused.
6. Validate a bounded paid OpenAI request through the approved worker path, including fallback and budget accounting. Do not test with real personal data.
7. Verify the AI switch, queue recovery, alarms and rollback path before opening new rooms.
8. Share the game URL only after a real playable session succeeds.

A successful build, declaration of resources or permission to deploy is not a live-site check. At the time this scope was documented, no AWS changes or paid OpenAI calls had been made for this release.

## Rollback

Pause new rooms and disable optional AI first. Keep canonical evidence, DynamoDB records and the private case intact. Restore a compatible prior code/assets release with a reviewed change set. Do not replace the case version while active rooms depend on it: drain/expire those rooms or implement a validated multiversion loader first. Deletion of secrets, persistent data or unrelated resources is not part of rollback.

See [deployment procedure](DEPLOYMENT.md), [AI accounting and recovery](AI_ORCHESTRATION.md) and [backend design](BACKEND_DESIGN.md).
