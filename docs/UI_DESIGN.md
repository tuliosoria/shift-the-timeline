# SHIFT mobile chat interface

## Intent

The interface is a phone-first messenger for investigators: pick a suspect, ask questions in a private chat and collect deductions. Restrained steampunk typography, original character illustrations and layered surfaces establish the setting without hiding controls or implying who is guilty. All player-facing copy uses British English.

## Turn flow

The game has four turns of six story-hours each. The story clock comes from the case (`clockStart`, default 20:00). The server stays authoritative throughout.

- **Suspects:** the roster of 15. Choose one suspect for the turn; earlier suspects may be revisited. A one-line notice on the landing page and lobby tells players AI voices the suspects.
- **Chat:** a messenger-style interview. You have three questions per turn, shown as a counter. Suggested-question chips offer starting points and free text is always available. A typing indicator shows while the suspect replies. The turn ends on your third answer, and an auto-continue moves you on after a short transition (skipped under reduced motion).
- **Deductions:** the case's list of deductions. Locked entries show a placeholder and never the text. When an answer unlocks one, a toast announces it. Deductions are individual: other players never see yours.
- **Waiting:** after you finish, you wait for the others. The turn advances when everyone has finished or when the host advances it after a confirmation, which also covers an absent player.
- **Accusation:** each accusation is private and irreversible. The reveal appears when the rules allow it and reports a complete, partial or defeat outcome.

The game keeps 3–4 players and 15 suspects.

The shared board, evidence sharing, notes, correlations, topic selector, consent checkbox, board search and case-film dialog from earlier builds no longer exist.

## Structure

The client is vanilla JavaScript modules without a framework: `app.js` holds state and actions, `api.js` talks to the server, `views.js` renders screens, `chat.js` runs the interview, `toast.js` shows unlock notices, `backdrop.js` handles background films and `ui-state.js` keeps small local state such as drafts.

On phones the chat is pinned to the visual viewport, so the on-screen keyboard does not push the header away, and the tab bar hides while the keyboard is open. A PWA manifest allows installing to the home screen; there is no service worker.

## Visual language

Navy and slate backgrounds, ivory text and warm brass accents evoke an investigator's instrument. The Rye wordmark has period character; body text and controls use system fonts for rapid reading. Translucency is reserved for context layers; text surfaces keep sufficient opacity and contrast. Three atmosphere films play as muted looped backgrounds (poster only under reduced motion); see [background films](CASE_FILMS.md).

Fifteen fictional portraits use distinct ages, faces, hair, clothing and silhouettes. Four portraits include a bald, tattooed, intimidating character as requested by the creative direction. Appearance conveys character, not evidence about guilt.

## Accessibility and resilience

- Body text and inputs are 16px; metadata is normally 13–14px and never relies on colour alone.
- Touch targets are at least 44×44px. Focus indicators, semantic headings, native fields, explicit labels and a skip link support keyboard navigation.
- The typing indicator, question counter, locked deductions and room code carry text alternatives. Toasts are announced politely.
- Decorative portraits have empty alternative text beside complete text labels. Missing art falls back to initials rather than preventing play.
- Reduced motion, safe-area spacing and low-height layouts are supported. Reduced motion is read live.
- Drafts are scoped to room, player, turn and suspect. Storage failure keeps an in-memory draft usable.

## Security and delivery boundaries

HTTP-only sessions and idempotent command IDs remain unchanged. Uncertain requests retain their exact body and ID through transport failures and HTTP 429; another mutation cannot replace them.

An exact asset allowlist is shared by HTTP serving and packaging. Arbitrary paths, symlinks and private files are excluded. Static media is served with `Cache-Control: public, max-age=86400`; everything else is `no-store`. The unmodified Rye font and licence are self-hosted; the game makes no external font request.

The complete English editorial case is a separately versioned private input. Public tests and screenshots use synthetic content. No private solution, credential or real player transcript belongs in this repository, browser assets or validation screenshots. Suspect briefs and locked deduction text are never sent to clients.

See [validation and remaining limits](VALIDATION_UI.md) and [art/font credits](../AI_AND_CREDITS.md).
