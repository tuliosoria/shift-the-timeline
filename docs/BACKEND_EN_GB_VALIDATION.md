# Correlations and British-English backend

## Implemented

- `correlate` creates an append-only team hypothesis with two distinct public sources, relation and up to 300 characters of text. Author, ID and round come from the server.
- Sources are limited to four published case facts, known suspects and canonical clue records already shared in this room. Notes, private message IDs, other-room IDs and extra source fields are rejected.
- Correlations share the 60-record board cap. They do not close interviews, advance rounds, change ballots, create evidence or call the narration provider.
- First execution checks the current round and phase. A committed retry returns current state containing its unchanged original record; it never reassigns an earlier hypothesis to a later round.
- The existing optional `expectedVersion` envelope remains accepted. If supplied, the durable API checks it on first execution. Receipt replay retains the existing precedence.
- Backend player-facing messages and the synthetic fixture are English. Free questions recognise English and compatible Portuguese keywords with word boundaries. The inactive provider instruction requests British English without enabling it.

## Verification

140 Node tests pass, including 29 new correlation/language tests. Syntax checks, npm audit (zero reported vulnerabilities) and the 15-file package pass. Regression tests reproduced the English “wonder”/Portuguese “onde” collision before the fix.

An independent review also exercised delayed round/phase races, replay after reveal, a configured AI spy and atomic rejection at the existing storage limits. No new resource, permission, budget or external request was introduced.

## Boundaries

The public commit contains only synthetic case data. Private editorial localisation is a separate, versioned artifact; this commit neither contains it nor switches any production room. Existing case-version hashes must remain pinned for active rooms.

Frontend, static HTTP asset serving and visual localisation are coordinated separately. This backend verification does not establish browser/mobile accessibility, DynamoDB/AWS behaviour, narrative playtest quality or deployment readiness.

Topic inference remains a deterministic keyword heuristic, not semantic understanding. Explicit topic choices continue to select their unchanged canonical topic keys.

## Integrated note-context compatibility

The updated UI submits team notes with `round` and `expectedPhase`. On first execution, the server rejects a mismatching context rather than assigning a delayed note to a later round. Receipt lookup still happens first, so replay preserves the original record and returns the current state. Older clients that omit both fields retain the previous note contract; supplying only one context field is invalid. Synthetic regression tests cover stale rounds, phase transitions, replay and legacy compatibility.
