# SHIFT investigation interface

## Intent

The interface is a field tool for investigators: readable dossiers, private interviews and shared deductions. Restrained steampunk typography, original character illustrations and layered surfaces establish the setting without hiding controls or implying who is guilty. All player-facing copy uses British English.

## Round flow

**Analyse → Interrogate → Deduce** is persistent local navigation, not three new server phases. Moving between stages sends no game command and does not close an interview.

- **Analyse:** review what is known, shared canonical findings and the suspect roster. Search or filter the dossiers, inspect one person, then explicitly confirm the round's interview choice.
- **Interrogate:** ask up to four questions in the current private interview. Canonical shortcuts select exact topic keys. Free questions use a disclosed deterministic topic heuristic. A share preview contains only the canonical answer, never the private question or optional narration.
- **Deduce:** connect two distinct public sources using a relation and a short hypothesis. Published hypotheses are labelled unverified. A separate team note remains available. Correlation is optional and cannot establish canonical evidence or guilt.
- **Finish my round:** a separate confirmation explains unused questions and unsent drafts. Only this action ends the player's investigation. Host advancement is also explicit and confirmed.
- **Accusation:** each ballot is private and irreversible. No absent player's ballot is invented. Collective reveal occurs only when the authoritative rules permit it.

The game retains 3–4 players, 15 suspects and three rounds. The server remains authoritative throughout.

## Visual language

Navy and slate backgrounds, ivory text and warm brass accents evoke an investigator's instrument. The Rye wordmark has period character; body text and controls use system fonts for rapid reading. Light comes consistently from the upper left. Translucency is reserved for context layers; text surfaces maintain sufficient opacity and contrast.

Fifteen fictional portraits use distinct ages, faces, hair, clothing and silhouettes. Four revised portraits include a bald, tattooed, intimidating character as requested by the creative direction. Appearance conveys character, not evidence about guilt. Stage illustrations supplement complete labels and numbers.

Mobile uses a single task column with a compact persistent context/stepper. Desktop adds a contextual side column. Low-height layouts release sticky positioning rather than consuming the reading area.

## Accessibility and resilience

- Body text and inputs are 16px; metadata is normally 13–14px and never relies on colour alone.
- Touch targets are at least 44×44px. Focus indicators, semantic headings, native fields, explicit labels and a skip link support keyboard navigation.
- Dialogs support Cancel, Escape, Tab wrapping and focus return. Polling preserves the active control, selection and draft.
- Decorative portraits and step icons have empty alternative text beside complete text labels. Missing art falls back to initials rather than preventing play.
- Reduced motion, safe-area spacing and low-height layouts are supported.
- Drafts are scoped to room, player, round and phase; questions also belong to a suspect. Old drafts remain labelled recovery text, never silently published in a new round. Storage failure raises a persistent warning while an in-memory draft remains usable.
- New rounds default to Analyse. An obsolete fragment cannot override the saved current context on reload. Earlier interviews require explicit history selection.

## Public correlation contract

A correlation has exactly two different public sources, one relation (`related`, `supports` or `contradicts`) and up to 300 characters. Sources are public case facts, known suspects or canonical clues already shared in the room. Private interview IDs, notes, unknown references, extra source properties and client-supplied canonical text are rejected.

The server supplies author, round and record ID. Correlations share the existing 60-record board limit. They cannot advance the game, create AI work or affect the culprit. A first execution validates round and phase; a successful retry returns the current authoritative state containing the original unchanged record.

New team notes similarly carry round and phase. Legacy clients omitting both retain the older contract; partially specified or stale new context is rejected.

## Security and delivery boundaries

HTTP-only sessions and idempotent command IDs remain unchanged. Uncertain requests retain their exact body and ID through transport failures and HTTP 429; another mutation cannot replace them. Confirmation context is rechecked before sending.

An exact asset allowlist is shared by HTTP serving and packaging. Arbitrary paths, symlinks and private files are excluded. The 18 transparent WebP illustrations total approximately 634 KiB. The unmodified Rye font and licence are self-hosted; the game makes no external font request.

The complete English editorial case is a separately versioned private input. Public tests and screenshots use synthetic content. No private solution, credential or real player transcript belongs in this repository, browser assets or validation screenshots. This implementation does not enable generative narration or deploy infrastructure.

See [validation and remaining limits](VALIDATION_UI.md) and [art/font credits](../AI_AND_CREDITS.md).
