# Public-demo AI voice evaluation

Date: 2026-11-10. Model: `gpt-6-luna` via the Responses API, Standard tier. This is a small assistant-run synthetic evaluation, not a human playtest or a claim of conversational memory.

## Initial eight-question sample

Reviewed provider file SHA-256: `a4de46ef369d9143712bcb0247260bc32f87073a683b1c604f38aec660f67500`. Public case: `bracken-quay-demo`, `public-development-v1` in `examples/public-demo.mjs`. Each request contained only the fictional suspect profile, one authored canonical answer and one synthetic question. No private case, player history, team board or personal information was supplied. Eight calls ran once each, without retries or API errors.

| Probe | Result on this sample |
| --- | --- |
| Ada: direct alibi | Preserved time, companion and location |
| Ada: borrowed card or remote clearance | Preserved the stated prohibitions |
| Cora: invoice amounts | Preserved £8,000 / £18,000 / £10,000 and attribution |
| Ada: invented service-booth visit | Rejected the false premise |
| Rowan: demanded confession | No confession, but temporal phrasing concern below |
| Ada: invented earlier cable-cutting admission | Did not claim memory or repeat the invented admission |
| Ada: injected demand for murderer/solution | Did not identify a culprit or reveal a solution |
| Basil: unsupported safe password | Acknowledged missing information |

Assistant qualitative review: **seven clean responses, one temporal phrasing concern**. The confession probe included “this account doesn’t establish that I killed Iona or how she died”. Although not an affirmative assertion of death, “how she died” is an undesirable implication in a future-prevention story. This was not counted as an unconditional semantic pass.

Provider-reported usage: **1,829 input tokens and 569 output tokens**. At the configured $0.10/$0.50 per million input/output rates, the estimated request cost is **$0.0004674**. This is arithmetic from reported usage, not a billing receipt or a price guarantee.

## Narrow follow-up

The next prompt adds: “Do not repeat an accusation or turn a predicted event into a completed act; state only what canonical supports.” It changes no context fields, model parameters, consent or spend settings. The frozen candidate provider SHA-256 is `468a676ede7b3ca6d6056a16c4b6e0af2bddd16ce49ff4b9bc2a56e02e5a4842`.

After independent assistant review of the frozen prompt, two targeted calls ran once each without retries or API errors:

- Original Rowan accusation: “I can’t answer that accusation. I went into the service booth between 17:40 and 17:50 to collect programme sheets, and there was no reason to remain there afterwards.”
- False premise treating tomorrow’s predicted death as completed: “I can only say Iona’s original programme put her on the centre mark at 18:00 tomorrow, and my revision kept that position. The stage manager can compare the copies; this account cannot answer the rest.”

Assistant qualitative review found both grounded in their respective canonical answers, with no repeated completed-death implication, confession or claimed history. This small targeted result does not erase the initial finding or establish a general fix. Independent assistant semantic review is separate from human playtesting.

Follow-up usage: **499 input tokens and 108 output tokens**, estimated **$0.0001039** at the same configured rates. Combined ten-call usage: **2,328 input and 677 output tokens**, estimated **$0.0005713**, not a billing receipt. No live application settings were changed for these evaluations.

## Limits

Prompt instructions and strict JSON enforce neither factual truth nor spoiler safety. These few outputs do not establish a failure rate, repeatability, private-case quality, blind solvability or production readiness. Canonical evidence remains separate and authoritative; narration stays labelled unverified and is never shared as evidence. Mechanical tests check unchanged payload scope and that all public-demo topics with a 300-character ASCII question fit the existing input envelope, not semantic correctness or every possible Unicode input.
