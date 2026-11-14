# Individual language validation — 14 November 2026

Base: `70bf253c614373fce0b3f3b6e076ee242e651eef`.
Branch: `feat/individual-en-pt-br`.

The feature adds individual EN/PT-BR preference, complete UI presentation and
optional private translated case sidecars. Existing English case pins and old
rooms remain compatible. Transcript entries, queued answers and earned deductions
capture their own language/text; changing preference does not rewrite evidence.

Independent core/UI review and full private translation fidelity review found no
remaining important issues after fixes. Public regression fixtures are synthetic.
The private package is a separate deliverable and is not present in public Git.

## Checks

- Node suite: 603 tests, 601 passed, one existing filesystem-ownership failure,
  one PostgreSQL integration skipped without a dedicated test database.
- Python suite: 25 passed; JavaScript syntax checks passed.
- Public immutable package: 58 verified files, private content excluded.
- Independent focused UI/API suite: 101 passed, plus Chromium language scenarios.
- All 19 browser regression scripts passed in grouped runs. The full run exposed
  a catalogue interceptor needing the locale query and a short-height audio-label
  wrap; both were fixed, with affected browsers rerun and independently reviewed.
- Actual private library: 720 canonical replies and 720 bounded prompt contexts;
  24 complete engine games and 24 complete isolated-cookie HTTP games, each set
  with 1,008 questions; twelve browser case/language flows. No paid calls.
- Private-to-public text scan and exact raw English library comparison passed.

The existing `local-secret` test requires every ancestor to be owned by the
process user or root. Here the process UID is 1000 and `/` and `/tmp` are owned by
65534. The reader and its tests are unchanged from the base; the security check
was not relaxed. This environment does not provide a PostgreSQL test URL.

Browser checks use `/usr/bin/chromium`; a temporary Playwright launch override
selects that already-installed cloud browser. No production browser code depends
on this test-only setup.

## Coverage and limits

Coverage includes EN defaults, both language displays, 320px layout, keyboard and
focus preservation, F5, blocked storage, mixed players, same-player tabs, explicit
rejoin, lost responses, rapid language changes, rejected entries, in-flight asks,
immutable pending jobs after restart/translation revision/removal, legacy jobs,
case/revision isolation, private projections and unchanged provider parameters.
Repeated preference changes use durable receipts without exhausting player data.

All current private cases have complete Portuguese sidecars. A missing translation
for another pinned revision gives visible English content fallback. Legacy
English transcript/jobs stay English. Unknown infrastructure error messages retain
their original text; user-entered text is never translated. Timeline time anchors
remain canonical internal keys and are not shown by the current reveal.

Offline fixtures do not validate live AI language fidelity or replace blind human
playtests. No live provider requests, production games, PR, merge, deployment,
credentials, model/cost/quotas, IAM or Azure workflow changes were made.
