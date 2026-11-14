# Private case libraries and safe releases

The server accepts either the existing single-case `{caseData, catalog}` JSON
artifact or a library:

```js
{
  cases: [/* current raw case definitions */],
  catalog: [/* public id, title, available, optional location/description */],
  defaultCaseId: 'synthetic-example', // optional
  archivedCases: [/* prior raw definitions needed by existing rooms */]
}
```

A trusted authoring module exports this object as `caseLibrary`. Individual
modules retain the existing `caseData`/`catalog` or `TRAIN_CASE`/`CASES` exports.
Every available catalogue entry must have exactly one current definition.
Archived revisions may be absent from the public catalogue. Libraries allow up
to 20 current cases, 40 archived revisions and 2 MB of JSON; each individual
case retains the 150 KB bound and existing schema. Single-case Azure artifacts
retain their 200 KB transport bound.

The catalogue remains the only case list sent to browsers. The current revision
is selected on room creation. Every command, interview, deduction, AI admission
and outcome subsequently resolves the room's `(caseId, caseVersion)` pin. Private
briefs and authored answers stay on the server; only a player's own settled
answers and unlocked deductions appear in their projection. Solutions appear
only after the shared reveal. AI provider settings and transport are unchanged.

## Preserve active rooms

Keep the original raw museum definition unchanged in the first library. Do not
serialise the validated object back as authoring data: validation appends the
content hash to the author's version label, and validating that result again
would create a different pin. The exporter writes the original raw definition,
including its property order. Tests exercise the exact legacy museum pin and a
pending AI job across a runtime replacement.

When editing a case, move its previous raw definition into `archivedCases` and
put the revised raw definition in `cases`. Retain every revision required by
unexpired rooms, including old admissions and pending jobs. A missing pin fails
closed with 503 rather than changing the mystery underneath an investigation.
Room schema, retention, rules (3–4 players, four turns, three questions per turn),
request receipts and AI jobs are not migrated by this change.

## Offline authoring and export

Private stories, solution notes, reports and exports belong in ignored
`private/`; public regression fixtures must be synthetic. Import only authoring
modules you trust: JavaScript modules execute code.

```sh
SHIFT_CASE_FILE=private/campaign.mjs node scripts/check-library.mjs
node scripts/export-case-library.mjs private/campaign.mjs private/release
```

The library check exercises all four replies for all 15 characters per case,
checks bounded AI contexts, runs complete three- and four-player authored-answer
sessions, and checks routes to key deductions while omitting each witness.
It reports counts rather than narrative. The test does not infer guilt: it uses
the authored truth to verify mechanics. It does not establish live AI behaviour,
blind-player solvability or narrative quality. Editorial and blind-playtest
requirements in [CASE_AUTHORING.md](CASE_AUTHORING.md) still apply.

The export contains `case-library.json` and `manifest.json` (SHA-256, byte count
and exact revision pins). Preserve both in an access-controlled private file
store, together with authoring sources and private review notes. Never attach
this material to a public issue, PR, repository or CI artifact.

## Prepare a release without deploying

The default Azure build still uses only the public museum. Private content
requires an explicit reviewed JSON file; environment variables cannot opt in:

```sh
npm run package:azure -- --case-bundle private/release/case-library.json --release-commit <reviewed-40-character-SHA>
```

The builder validates the JSON without executing an authoring module, copies it
verbatim to `build/azure/private/case.json`, and records its digest in
`case-manifest.json`. Private content is not compiled into server or browser
assets. The HTTP allowlist never serves the private path. The generated Azure
bundle is itself private; do not upload it as a public GitHub artifact.

Publishing is a separate operator action. Before an authorised release, verify
that all active revision pins are in the bundle; retain an accessible backup of
the prior package and private library. Deploy code and data as one reviewed
package through an approved private artifact path, preserving database, AI
configuration and existing sessions. Confirm catalogue, release SHA and privacy
using read-only checks; use isolated authorised staging for gameplay.

A rollback to the old single-case server cannot serve new-case rooms. Prefer a
forward repair retaining all revision pins. If a rollback is unavoidable, pause
new admissions and wait for affected rooms/jobs to expire, or use a rollback
package containing compatible library code and every required raw revision.
Do not delete or rewrite live rooms to make a rollback fit.

## Individual languages and translation revisions

English (`en-GB`) remains the default. A library can additionally contain a
`translations` array of complete Brazilian Portuguese (`pt-BR`) sidecars. A
sidecar names the canonical `caseId` and exact validated `caseVersion`; it cannot
replace the culprit, suspect IDs/names, clock, deduction keys/sources or timeline
time anchors. Its allowed text fields are `title`, `victim`, `place`, `method`,
`prediction`, public `catalog` text, 15 `suspects` with roles/profiles/openings/
briefs/four responses, matching `deductions` with translated text, and the
`solution` with matching evidence/timeline counts. No other fields are accepted.
Timeline time keys remain canonical; the current reveal does not display them.

These sidecars are private, just like the original stories. Their addition does
not change an English case hash. The exporter copies the original raw library,
including translations, and records `translationPins` with each sidecar SHA-256
alongside the existing English `casePins`. Never rebuild an authoring source
from a validated/localised runtime projection.

Create/join may send a locale; `setLocale` changes only the requesting player.
Preferences use existing durable receipts for retries rather than consuming the
player's gameplay request log. Case content falls back to English when the exact
pinned revision has no Portuguese sidecar; the UI explains that fallback.

Each accepted question captures its effective content language and fallback
answer; each new deduction stores its displayed text with its source receipt.
Pending jobs carry the corresponding language and candidate text. Changing a
preference or updating/removing a sidecar never rewrites settled interviews,
earned deductions or queued context. Legacy records without these fields remain
English. Preserve old raw English revisions and any translations you want old
rooms to use for future interviews. A translated sidecar update may affect future
interviews and the current public dossier, but not previously earned testimony.

AI output language is selected only in the authored-context instructions. Model,
provider parameters, budget, credentials and orchestration policy are unchanged.
Offline tests do not establish live model language fidelity.

The browser translates known UI and API error messages at presentation time;
unrecognised infrastructure errors retain their original text. User-authored
names, questions and notes are never translated. A previously stored English
interview or legacy queued job remains English after selecting Portuguese.

For a language-enabled release, keep compatible code and private data together.
Older code may not honour captured translated deduction text or queued language
context. Prefer a forward repair; otherwise use a compatible rollback package
or wait for affected rooms and jobs to expire before reverting code. Do not
rewrite existing testimony or room pins during release or rollback.
