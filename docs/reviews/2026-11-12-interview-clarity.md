# Future Crime Police: interview clarity and deduction retention

## User report and diagnosis

The supplied mobile screenshots show Ada greeting the player with an abstract maxim, denying knowledge of the investigator, past-event suggested questions, and a turn-two notebook showing 0/12 deductions. The interview prompt previously prohibited greetings and knowledge of the forecast unless the private brief explicitly provided it. That conflicted with the intended shared premise.

## Changes

- Establish the player as Future Crime Police investigating a possible future murder. The person at risk is still alive; past preparations remain past facts. Recognising the investigator's role does not grant knowledge of their personal identity, private evidence or vision.
- Encourage short, natural replies and contractions, without inventing facts or weakening evidence, chronology, attribution and spoiler boundaries.
- Give all 15 public-demo suspects an ordinary in-character greeting rather than a cryptic evidence maxim.
- Replace past-death question shortcuts with preparation, unusual observations, recent disagreements and knowing the living person at risk. The last two name the case's public victim.
- Explain cooperation, separate interviews, private notes, automatic turn progression and the final team choice in plain English. The 24-hour story clock is not a real-time timer.

## Deductions: investigated, not claimed fixed

No loss was reproduced. Storage retains player deductions and source messages across all four automatic turns, codec serialisation and service restart. Additional tests cover a late AI award after turn advancement, subsequent writes, duplicate settlement and player isolation. The screenshot alone cannot establish whether cards were previously awarded. A specific affected room and its earlier answers are needed to distinguish an absent unlock from a lost award. Do not reset rooms, fabricate cards, or relax award criteria on that evidence alone.

## Room-safe integration

The final implementation leaves `examples/public-demo.mjs` byte-for-byte identical to main. Copy lives in a presentation module, so validated case versions and all existing rooms remain unchanged. New interview selections receive the natural greeting; previously stored greetings and answers are not rewritten. Queued AI jobs keep their existing context; future questions use the revised prompt. No room migration or reset is needed. No production data or secrets were changed.

## Verification limits

Automated tests cover context instructions and authored content, not actual model behaviour. Live paid-model evaluation and a human conversational playtest remain necessary to assess tone and premise adherence in generated replies. A deterministic prompt assertion is not proof that every generated reply will comply.

Final local verification: `npm test` completed with 525 passed, 0 failed, 1 skipped (526 total); `npm run check` passed syntax checks; `git diff --check` passed. `npm run test:browser` could not start because neither pinned Chromium nor Chrome is installed in this cloud environment. No browser or live paid-AI success is claimed. Independent review caught and corrected an ambiguous day-relative question and a misleading suggestion that interviews could end before all three questions.
