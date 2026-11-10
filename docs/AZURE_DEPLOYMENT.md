# Azure playtest deployment: preparation only

The Azure template is **not a deployment receipt**. Do not infer that resources exist or that the backend is publicly playable. The existing AWS template is preserved; this migration does not delete resources or copy any live room data.

## Chosen small-backend shape

- A dedicated resource group, suggested `rg-shift-playtest`, in the approved personal subscription and region.
- Linux App Service **B1**, one instance, Node 22. It hosts the same-origin web/API service. It has no autoscale or high availability promise.
- PostgreSQL Flexible Server **B1ms**, 32 GiB, PostgreSQL 16, seven-day backup, **private delegated subnet only**, no public DB endpoint. The relational adapter must preserve atomic room/receipt/budget transactions and optimistic concurrency; do not substitute the in-memory development store.
- VNet integration and a linked private DNS zone.
- Key Vault is deferred entirely. No vault, secret, provider registration or secret-read grant is created by this template.
- System-assigned web identity; PostgreSQL uses **Entra-only authentication**. The application gets a database role with DML only after explicit bootstrap, never database administrator privileges.

Initial web **and SCM** ingress is restricted to the operator's explicitly supplied IPv4 CIDR. HTTPS is required, FTP and basic publishing credentials are disabled. Room admission and AI are both off.

The inspected personal subscription is a Visual Studio/MSDN development subscription with its spending limit on. Treat this as a **development/playtest** proposal until production eligibility and any credit limitations are checked. Azure credit exhaustion can suspend resources. OpenAI usage is billed separately and is not covered by Azure credit.

## Cost and approval checkpoint

Get a fresh pricing estimate for the chosen region and subscription before executing. This template creates continuously billed App Service/PostgreSQL capacity. It does not establish a hard billing cap. Budget alerts notify; they do not cap spend.

Public USD retail rates retrieved November 10, 2026 for the approved **West US 3** from the [Azure Retail Prices API](https://prices.azure.com/api/retail/prices): Linux B1 App Service $0.017/hour; PostgreSQL Flexible Burstable B1MS $0.017/hour; PostgreSQL storage $0.115/GB-month. At 730 hours and 32 GB, these three base charges total **$28.50/month**, before DNS, traffic, secret operations, excess backup, tax or subscription-specific adjustments. Treat roughly $30–40/month as a small-playtest planning range, **not a guaranteed total or spending cap**. Requery pricing for any other region or SKU; no current free credits or remaining allowance have been verified.

Budget categories:

- B1 Linux App Service hourly compute.
- B1ms PostgreSQL hourly compute plus 32 GiB provisioned storage; additional backups, if any.
- DNS queries/zone, outbound transfer and logs.
- No AI usage, model deployment, AWS resource, container registry or public-domain purchase is included.

Also obtain explicit approval for the exact subscription, region, monthly allowance, role grants, operator ingress restriction, Entra database-admin assignment and future public opening. No destructive cleanup is part of this runbook.

## Inputs and validation (no resource changes)

Use `infra/azure/main.bicep`. Required inputs are the operator CIDR, exact approved case artifact SHA-256, and the verified human Entra administrator object ID/name. These are references/configuration, not a password. Do not put keys or access tokens into parameter files.

```sh
az account show --subscription "$SHIFT_SUBSCRIPTION" \
  --query '{name:name,id:id,user:user.name,tenant:tenantId}'
az bicep build --file infra/azure/main.bicep --outfile /tmp/shift-azure-main.json
```

After approval to create the resource group and resources, use an explicit subscription on every Azure command. Do not change or rely on a default account that may belong to a work tenant. Review a group deployment `what-if` before `create`; ensure the changes remain wholly within the dedicated SHIFT group. **Do not execute deployment merely because Bicep compiled.** A compile does not verify regional capacity, subscription eligibility, RBAC, DNS connectivity or actual runtime behavior.

`infra/azure/plan.sh` validates required environment inputs and previews only the approved West US 3, operator-only bootstrap deployment. It expects `SHIFT_SUBSCRIPTION`, `SHIFT_RESOURCE_GROUP`, `SHIFT_OPERATOR_CIDR`, `SHIFT_CASE_SHA256`, `SHIFT_ADMIN_OBJECT_ID`, and `SHIFT_ADMIN_NAME`; run it with `bash infra/azure/plan.sh` after the group exists. It never creates resources. Initial preview uses `bootstrapMode=true`; after database initialization explicitly set it false to select the normal runtime. The bootstrap package must include `server/azure-bootstrap.mjs`.

Actual preflight on 2026-11-10 found **Central US App Service B1 quota zero** (`SubscriptionIsOverQuotaForSku`, required 1). The dedicated resource group was created, but this preflight prevented applying the resource deployment. Advertised regional SKU availability is not subscription quota. Subsequently, full West US 3 preflight passed for all 11 resources and the region change was explicitly approved. The initial deployment uses the already-created, central-named resource group with all regional resources explicitly in West US 3. Resource-group metadata location does not determine resource location. Do not create a duplicate stack merely to rename the group; preserve existing resources.

The template's default hostname supplies `SHIFT_ORIGIN`. A custom domain is a separate DNS/certificate decision. Keep both `allowPublicAccess=false` and `allowNewRooms=false` through staging. Do not use `0.0.0.0/0` to bypass staging restrictions.

## Application contract

The application package must include the Azure entrypoint `server/azure-index.mjs`, adapter dependencies and only explicitly approved server files. Do not publish an entire working directory. The app uses:

| Setting | Value/purpose |
|---|---|
| `SHIFT_RUNTIME` | `azure` |
| `NODE_ENV` | `production` |
| `SHIFT_ORIGIN` | The HTTPS App Service origin |
| `HOST`, `PORT` | `0.0.0.0`, `8080` |
| `SHIFT_PG_HOST`, `SHIFT_PG_PORT` | Private PostgreSQL FQDN, `5432` |
| `SHIFT_PG_DATABASE`, `SHIFT_PG_USER` | `shift`, `shift_app` |
| `SHIFT_CASE_FILE`, `SHIFT_CASE_SHA256` | Server-only approved JSON case path and exact digest |
| `SHIFT_ALLOW_NEW_ROOMS` | `false` until smoke checks pass |
| `SHIFT_AI_ENABLED` | `false`; this deployment does not activate AI |

There is no `SHIFT_PG_PASSWORD` in this template. The runtime obtains a short-lived managed-identity token for `https://ossrdbms-aad.database.windows.net/.default` on new connections and uses verified TLS. Never use `rejectUnauthorized:false`. Do not log tokens, database connection credentials, questions, private answers or case files.

A private case must be installed only as an approved server-side artifact, never in the public assets directory. Alternatively, explicitly select the published development-demo case and label that deployment accordingly. A demo is not a substitute for verifying Túlio's private editorial case. The case digest must match before serving rooms.

## One-time private database bootstrap

Creating a server and assigning a human Entra admin **does not** create the app's PostgreSQL principal or apply schema migrations. Bootstrap must run from an authorized operator session with access to the private database network. The Mac's normal internet connection cannot reach this delegated subnet directly. Use an approved administrative network/session; do not temporarily expose the DB publicly, give the application administrator rights, or enable an all-Azure-services firewall exception to get around this requirement.

With the human Entra DB administrator connected to the `postgres` database, create the app's PostgreSQL principal using the **web app managed-identity object ID**, not its application/client ID:

```sql
select * from pg_catalog.pgaadauth_create_principal_with_oid(
  'shift_app', '<web managed-identity object ID>', 'service', false, false
);
```

The function is documented by Microsoft: <https://learn.microsoft.com/en-us/azure/postgresql/security/security-manage-entra-users>. Recheck the current syntax and privileges before execution. The last two flags keep the app non-administrative and do not assert interactive MFA for a service principal.

Connect to `shift` as the human administrator, apply the versioned schema migration, and grant only database `CONNECT`, schema `USAGE`, and required table `SELECT/INSERT/UPDATE/DELETE` to `shift_app`. Do not grant schema `CREATE`, database ownership, `CREATEROLE`, `CREATEDB`, or admin extension-management rights. Set default privileges only for the migration owner if future migrations require them. Verify the app cannot perform DDL and can perform its expected transactional operations. The versioned schema is `server/storage/postgres.sql`. Its current grants (after inspecting and applying that exact migration) are:

```sql
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE shift TO shift_app;
GRANT USAGE ON SCHEMA public TO shift_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_records TO shift_app;
GRANT SELECT ON public.shift_schema_version TO shift_app;
```

On the dedicated SHIFT database, revoking schema CREATE from PUBLIC prevents inherited DDL privileges from defeating the restricted app role; include this in the bootstrap security scope. Do not give the application write access to the schema-version table. It checks readiness, not migrates itself.

## Verified subscription availability and private bootstrap path

Read-only checks on 2026-11-10 found PostgreSQL Flexible provisioning restricted for this subscription in East US, East US 2 and West US 2. **Central US, West US 3, North Central US and Canada Central** report PostgreSQL availability; Central US reports `OfferRestricted: Disabled`, `Standard_B1ms`, and 32 GiB storage. Region capability is not a reservation or deployment guarantee. Central US retail compute is $0.018/hour for Linux App Service B1 and $0.01921/hour for PostgreSQL B1ms, approximately $27.16/month at 730 hours, **plus disk, DNS, traffic, backup overage and tax**. Recheck the full regional estimate against the approved $35–40/month plan before deploying; budgets are not hard caps.

The private database can be bootstrapped through the operator-restricted App Service without a public database exception or copying human tokens into the application:

1. Deploy an explicitly reviewed **maintenance-only entrypoint** first. It must keep the App Service container healthy without connecting to PostgreSQL, serve no game operations, and remain under the same operator-only ingress restriction. The normal entrypoint currently exits until schema readiness, which prevents depending on its SSH session for first bootstrap. Do not bypass readiness in the production entrypoint.
2. Open an Entra-authenticated local tunnel with `az webapp create-remote-connection --resource-group <group> --name <app> --port 22222`. Azure CLI 2.89.1 was inspected: its tunnel uses SCM bearer authentication when basic publishing is disabled. Keep basic publishing disabled. If this path fails on the actual platform, stop and diagnose rather than enable it.
3. Through that authenticated tunnel, establish SSH local forwarding from `127.0.0.1:15432` to `<private-postgres-fqdn>:5432` in the app container network. Bind both local listeners only to loopback. Verify/pin the SSH host key through the authenticated channel; do not globally disable SSH host-key checking. The App Service image supplies the internal SSH endpoint, not a public SSH listener.
4. Run the database bootstrap client **on the Mac**, using the signed-in administrator's short-lived PostgreSQL token retrieved into process memory from Azure CLI (`https://ossrdbms-aad.database.windows.net`). Never print it, put it in command arguments, write it to disk, or copy it into app settings/container files. PostgreSQL authentication sends it only to the intended database over TLS.
5. Connect to loopback port 15432 but explicitly set TLS `servername` to the real PostgreSQL FQDN and `rejectUnauthorized: true`. Validate certificate chain/hostname. Apply the principal creation, schema migration and least-privilege grants above. Do not use a connection setting that silently disables certificate checks for the tunnel.
6. Close SSH forwarding and the Azure tunnel, discard the in-memory token, deploy the normal reviewed entrypoint and verify managed-identity readiness. No database admin credential or token persists in the runtime.

This is an executable connection strategy, not a claimed successful bootstrap. The actual container SSH path, Entra login and live migration remain untested until approved provisioning. The concrete security approval should cover the dedicated VNet/subnets/private DNS, no public database endpoint, human Entra DB administrator, limited application managed identity, operator-only HTTPS/SCM ingress, disabled basic/FTP publishing, and this temporary maintenance deployment. No Key Vault secret upload or app secret-read role is part of that approval.

## Release and live verification gates

1. Pass unit, concurrency, adapter contract and **real PostgreSQL integration tests** on the exact code revision. Mocks alone are not evidence of transactional parity.
2. Compile Bicep; review intended ARM changes and explicit permission grants. Apply only after approval.
3. Complete private network bootstrap and verify schema/least privilege.
4. Deploy the immutable verified Node package with Entra-authenticated tooling. Do not enable basic SCM credentials as a shortcut. No deployment workflow or repository federation is created here.
5. Verify no vault/secret grant was added and AI is disabled, HTTPS/TLS is correct and unsupported origins are rejected.
6. Use authorized operator access to test 3/4-player rooms, private interviews, sharing, accusations, reconnect/retry, concurrent commits, host recovery and expiration. Restart the app and verify persisted sessions/rooms, not just a successful homepage.
7. Exercise backup restoration into a separate test server/database and rollback compatibility before relying on it for valuable sessions. This is not yet tested merely by setting seven-day retention.
8. Only after these checks, explicitly approve opening public ingress and room admission. Confirm privacy/retention notices and rate limits. Keep a reversible room-admission switch for incidents.

## Future OpenAI activation (separate approval)

For future Azure AI activation, separately provision Key Vault rather than using GitHub Actions secrets as runtime secret storage. A future reviewed change may give only the AI worker identity `Key Vault Secrets User` on the specific OpenAI secret, never vault-wide administrator access. Uploading the existing key, granting that access, choosing live usage limits and enabling a worker are separate consequential steps; none is performed by this template. Use the supported secure key path and never echo the key, write it to Git, or expose it in browser configuration.

## Rollback and retention

Pause new rooms; deploy the previously verified application version that remains compatible with the current schema and case version. Preserve PostgreSQL and backups. Schema downgrade and deletion are not automatic. App Service B1 has no staging-slot swap; do not promise zero-downtime/canary behavior. Do not replace the case under active rooms unless the application supports both case versions or existing rooms have expired. Deleting the resource group is destructive and is not rollback.

## Approved regional-database fallback

The initial West US 3 B1ms PostgreSQL create failed with `SkuNotAvailable`, including one explicit zone-2 retry, despite successful capability/preflight checks. The approved fallback keeps the existing West US 3 App Service and adds **Central US** B1ms PostgreSQL in a dedicated `10.88.0.0/16` VNet, with a delegated `10.88.2.0/28` database subnet. `infra/azure/database-regional.bicep` owns this fallback. It adds symmetric private peering to the existing SHIFT `10.87.0.0/16` web VNet, without forwarded traffic, gateway transit or public database access. DNS links let the existing web VNet resolve the new database hostname. No unrelated VNet is peered.

**Do not reapply `infra/azure/main.bicep` after selecting this fallback.** The original all-in-one template would attempt the failed regional database again, could overwrite the new `SHIFT_PG_HOST`, and redeclare network children. Use `database-regional.bicep` for updates to the fallback database/network only. Preserve the existing app and its independently managed configuration. Future consolidated infrastructure must import and review this topology rather than recreate it. `plan.sh` previews the original bootstrap template, not this fallback; do not mistake it for a preview of the deployed cross-region topology.

The approved fallback's retail base estimate is $30.59/month at 730 hours: West US 3 Linux B1 $0.017/hour, Central US PostgreSQL B1ms $0.01921/hour, plus 32 GiB storage at $0.13/GiB-month. Global peering charges $0.035/GB on ingress and $0.035/GB on egress at the two endpoints (approximately $0.07 per GB transferred one direction across the link). DNS, other traffic and tax are additional. The $35–40 planning range is not a billing cap and depends on light traffic. Cross-region database round trips add latency.

After successful provisioning, configure the app's `SHIFT_PG_HOST` to the **regional template output**, not the old failed server name. Bootstrap through the same existing App Service SSH tunnel, forwarding to that new private hostname. Run the local human-token migration and managed-identity checks before activating the normal entrypoint. The app remains in maintenance until readiness is verified. No OpenAI key transfer or activation is part of this fallback.

A separately approved temporary exception may permit Azure-authenticated SCM networking without source-IP restrictions when the execution proxy rotates. It must not open the main website, enable basic publishing or FTP, or create anonymous SCM access. The operator performing that exception owns restoring SCM to the main restricted policy immediately after bootstrap; the regional database template never changes SCM or web ingress.

## OpenAI pricing and privacy gate (not activation)

The provider pins `service_tier: "default"` (Standard) rather than inheriting a project-level Fast setting. It also sends `prompt_cache_options: {mode: "explicit"}` with no breakpoints, disabling implicit prompt-cache use and writes. `store: false` remains set. These choices do not establish Zero Data Retention or eliminate applicable abuse-monitoring retention.

On 2026-11-10, the [official GPT-6 Luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna) and [pricing page](https://developers.openai.com/api/docs/pricing) list Standard `gpt-6-luna` at USD $0.10 per million input tokens and $0.50 per million output tokens. The 2,500-input/350-output envelope reserves 425 microUSD ($0.000425) per call at those rates. Reverify prices before activation or changing models. Cache-write rates differ; do not remove the explicit-only/no-breakpoint setting without updating accounting.

See the [prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching) for explicit-only behavior and the [Fast mode guide](https://developers.openai.com/api/docs/guides/fast-mode) for project-default processing tiers. Test the exact model/request combination after explicit paid-call approval. No model, secret destination, paid budget, player-data transmission, or hosted AI activation is authorized by this document or code change.

### Explicitly uncapped narration spending

The operator may explicitly choose `uncapped: true` with `roomMicroUsd`,
`dayMicroUsd`, and `monthMicroUsd` all set to JSON `null`. This removes the
application's financial ceilings; it does not create an unusually large hidden
ceiling. On a publicly reachable game, consented requests can therefore incur
unbounded cumulative OpenAI charges. Provider account limits, if any, are
separate and are not configured or guaranteed by this application.

Token envelopes, two concurrent reservations maximum, request deadlines,
per-question consent, durable reservation/settlement accounting and canonical
evidence authority remain enforced. Accounting rejects numeric overflow rather
than losing precision. Omit `uncapped` to retain the existing bounded mode;
invalid or mixed modes fail closed. Neither configuration mode authorizes
activation or transferring credentials by itself.

## Verified-main CI deployment (explicitly enabled only after integration checks)

The optional deployment job uses GitHub OIDC with the exact federated subject
`repo:tuliosoria/shift-the-timeline:ref:refs/heads/main` and audience
`api://AzureADTokenExchange`. It deliberately declares **no GitHub environment**:
there is no environment approval or environment branch-protection gate. This is
an approved alternative to the unavailable environment-administration path, not
an assertion that an environment was configured. Treat changes merged to `main`
and the deployment workflow as trusted release-authority changes.

Repository variables `SHIFT_AZURE_CLIENT_ID` and `SHIFT_AZURE_TENANT_ID` identify
the narrowly scoped federated identity. `SHIFT_AZURE_DEPLOY_ENABLED` must be
explicitly set to `true` to enable deployments; unset means disabled. Only a push
to `main`, after both `validate` and real-PostgreSQL tests pass, can enter the job.
Only that job receives `id-token: write`. Deployments serialize without cancelling
an in-progress release, reject stale main revisions, download the immutable
package built by the same run, and verify its SHA-256 before deployment.

The helper uploads a commit/digest-named zip to the separately approved private
release container using Entra login and refuses overwrite. It uses a 15-minute,
HTTPS-only, read-only single-blob user-delegation SAS held in memory and an ARM
bearer token held in memory. It does not change app settings, public/SCM ingress,
networking, IAM, database state, or publishing credentials. **SCM restrictions and
disabled basic publishing remain unchanged.** No publish profile or stored
client secret is required.

The release-container 1 GB preflight is preserve-only, not a hard storage quota;
serialize writers and account separately for unrelated containers. No artifact
cleanup or lifecycle policy is configured. A retry encountering an existing blob
fails closed: inspect whether the earlier deployment took effect rather than
replacing the artifact or automatically repeating an uncertain deployment.

The public ARM OneDeploy schema does not specify the response body. Inspected
Azure CLI code accepts successful PUT responses without guaranteeing a deployment
ID. The helper accepts an empty HTTP 200/201/202 response as **acceptance only**.
For this path it never inspects deployment history: within 600 seconds it requires
two consecutive exact served-commit responses from `/api/release`, each accompanied
by HTTP 200 from `/healthz`, with five seconds between checks. It reports
`release_verified`, not completion of a specific ARM operation. This proves which
revision is serving and basic database readiness, not that a new operation just
completed, that this PUT caused activation, or that every app instance has updated.
A preexisting identical revision can satisfy these serving checks. No prior-distinct revision is required, so first deployment from a
legacy build without `/api/release` remains possible. Unknown nonempty bodies and
error responses fail closed; PUT is never automatically retried.

When PUT supplies an explicit deployment ID, the helper polls only that ID until
`complete=true` and numeric `status=4`, then allows 120 seconds for the same two
revision/readiness checks. Read-only live inspection confirmed GET may return
`{value:[{id,location,name,properties,type},...]}`, with the operation UUID, status
and completion flag inside `properties`. The helper selects only the exact ID
accepted by PUT, never the first, latest or active historical entry. An absent ID
waits only within the bounded polling deadline; duplicate matches or malformed
entries fail closed. Direct single-record GET responses remain supported.

Live PUT/package-pull integration, scoped role assignments and SAS generation
must still be verified before enabling the repository switch. A failed
post-submission check does not prove that deployment did not occur.

The bundle embeds the tested commit at package-build time. CI reads the release
and health endpoints without credentials and requires the exact revision and
readiness before reporting verification. The endpoint exposes only the revision, with no caching;
unversioned local builds return 404. This verifies the served revision, not
comprehensive game health or database migration correctness.
