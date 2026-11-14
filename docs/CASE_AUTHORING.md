# Private case readiness

Keep editorial mysteries outside the repository in the ignored `private/`
directory. Never include the culprit, canonical responses or solution in public
screenshots, issue reports or CI fixtures. Use synthetic fixtures for regression
examples. The preflight executes a JavaScript module: only run a trusted module
you authored or reviewed, never an arbitrary downloaded file.

## Local preflight

```sh
SHIFT_CASE_FILE=private/train-case.en-GB.mjs npm run check:case
```

For the public synthetic development fixture:

```sh
SHIFT_CASE_FILE=tests/fixtures/case.mjs npm run check:case
```

The checker itself makes no network or AI calls. No case is selected
automatically. The preflight-generated report contains counts, outcome names and generic
warnings, not narrative text, culprit IDs, answers or the solution. The imported
module itself is not sandboxed: its logging, warnings and other side effects
are not suppressed. Remove private debug logging before running or sharing any
terminal output. Import
errors are deliberately suppressed because modules can throw private content.
Inspect your own local module when diagnosing a failure; do not post its contents.

The command validates the supported schema, exercises all 15 suspects across all
four canonical topics, checks private projections, and runs complete/partial/
defeat outcomes. Identical answer text produces a warning for editorial review,
not a rejection. These checks cannot establish that clues are fair, redundant,
interesting or logically sufficient. A successful check is not a readiness-to-
publish verdict.

## Supported module shape

Export `TRAIN_CASE` (or `caseData`) and `CASES` (or `catalog`). The case needs
`id`, `title`, `victim`, `place`, `method`, `prediction`, `culpritId`, exactly 15
unique suspects, and a `solution`. A version string is optional. An optional
`clockStart` (24-hour `HH:MM`, default `20:00`) sets the story time of turn 1;
each later turn is six hours on, and the crime is 24 hours after `clockStart`. Suspect IDs and
case IDs use lowercase ASCII letters, digits and hyphens (1–40 characters).
Each suspect needs `id`, `name`, `role`, `initials`, `color`, `profile`, `opening`,
a `brief` and nonblank `responses` for `alibi`, `motive`, `clue` and `relationship`.
The solution needs `motive`, `plan`, an `evidence` array of strings and a
`timeline` array of objects containing `time` and `text`. Empty arrays are
structurally accepted, not a claim of adequate exposition.

`brief` is a nonblank string of at most 2,500 bytes for the AI only: what the
suspect knows, hides and lies about. It is never sent to clients.

The case also needs `deductions`, an array of 6–20 objects
`{id, text, sources, key}`. `id` follows the usual ID pattern, `text` is at most
160 characters, and `sources` holds 1–6 entries `{suspectId, topic}` with an
existing suspect ID and a topic of `alibi`, `motive`, `clue` or `relationship`.
A deduction unlocks when a player asks a listed suspect about a listed topic
(canonical answers) or when the AI awards it from that suspect's sources. At
least 3 deductions must be `key: true`. Locked deduction text is never sent to
other players; each player sees only their own. `npm run check:case` reports the
deduction count, key count and the fewest distinct suspects whose sources cover
every key deduction (the string `">9"` means more than 9 are needed).

Catalog entries require `id`, `title` and boolean `available`. Only optional
`location` and `description` presentation strings are additionally supported;
do not put hidden fields in the catalog. The current case must have an available
entry. Narrative strings are nonblank and limited to 5,000 UTF-8 bytes; the case
has a 150,000-byte total bound. Keep the existing private content version pinned
for active rooms; schema checks do not migrate those rooms.

## Editorial playtest gate

Before distributing the real case, run blind 3- and 4-player sessions. Record
aggregate timing, topics that confused players, whether teams could articulate
the evidence chain, and how missed witnesses affected the conclusion. Keep
spoiler-containing notes private. Check at least one investigation route that
misses each major clue source; redundant evidence must remain discoverable
within the 12 questions (four turns of three) each player has. Have people unfamiliar
with the solution distinguish the culprit from plausible alternatives.

Repeated questions and topics are allowed and consume a question like any other accepted ask; a retry of the same request remains idempotent. Earlier answers remain available for review. Later turns can revisit a suspect. AI conversation context can retain up to eleven settled exchanges with the same player and suspect across turns, subject to storage limits. Author distinct voices and useful follow-up knowledge in the brief; do not rely on every earlier exchange being retained. Canonical keyword matching is not AI
understanding. When AI voices the answers it may only echo the case and unlock
deductions of the suspect being interviewed; it never decides the truth or the
outcome, and canonical answers are the fallback.

For multiple cases, pinned revisions, private export and Azure packaging, see
[CASE_LIBRARY.md](CASE_LIBRARY.md).

For EN/PT-BR authoring, use the complete text-only sidecar contract in
[CASE_LIBRARY.md](CASE_LIBRARY.md#individual-languages-and-translation-revisions).
Keep all translations and linguistic review notes under ignored `private/`.
