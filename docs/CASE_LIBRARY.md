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
