# Private suspect files and safer question drafts

This campaign builds on `60056806b4985530b54fb084bf7f02bd9aef3c3a` (PR #51). It preserves the phone-first design, individual evidence, all question and turn rules, authored case facts, model prompt and production configuration.

## Player-facing changes

- Open a private suspect file from an interview, the suspect picker or the summons. It brings together the public dossier, this player's recorded visits and this player's unlocked deductions from that suspect. Source links still point to the exact recorded answer, not a generated summary.
- Review earlier visits without consuming a question or changing the current interview. Returning keeps the current draft and restores the chat's reading position. Notebook location survives reload when browser storage is available; no other player's testimony is added.
- Suggested questions now fill an empty draft for review instead of immediately sending. Suggestions cannot replace text already in the composer. The player must explicitly send the question.

## Provider boundary

Provider output must be one completed assistant message containing one structured-text answer, optionally accompanied by completed reasoning output. Refusals, unfinished messages, unexpected tool output and ambiguous message combinations are rejected rather than concatenated into apparently valid testimony. The existing worker settles a rejected answer with canonical fallback, without an additional paid request.

Raw returned deduction IDs remain available to the evaluation tools so invalid-ID diagnostics are not silently erased. Server settlement continues to scope awards to the current suspect and suppress duplicate awards.

## Verification and limits

All campaign verification uses local synthetic providers or no-question hosted navigation. No paid AI evaluation is authorised by this campaign, and the previous campaign's allowance is not reused. Synthetic tests can establish transport handling, exact-once fallback, private navigation and draft preservation; they cannot establish more natural model conversation or semantic entailment of every deduction.

The known probabilistic dialogue-repetition and current-reply clue-completeness limitations remain. No prompt change is presented as a solution to them. The private editorial case and an unspoiled human playtest remain separate from public-demo technical verification.

Required gates are the final local test suites and syntax/package checks, independent source review, exact-head CI including real PostgreSQL and pinned Chromium, and the existing authorised main deployment. The release is complete only after the served revision and health match the merged commit. Verification results are recorded in the pull request and completion receipt.
