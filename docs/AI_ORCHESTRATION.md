# AI orchestration

## Runtime status

Azure staging is active with hosted `gpt-6-luna` dialogue. Release `370ab445f624a45d9d0b3ba212a3bebc8bf9633e` ([PR #48](https://github.com/tuliosoria/shift-the-timeline/pull/48)) passed CI, deployed, and completed six independently reviewed hosted AI replies on 11 November 2026. This is a dated release receipt, not a claim that every later commit has deployed or passed live evaluation. See the [Azure handoff](AZURE_HANDOFF_2026-11.md).

The retained AWS HTTP/Lambda path remains canonical by default. Its separate AI workers, relay, reconciler and triggers are declared but disabled in the template. Azure activation is not evidence of live DynamoDB/SQS/Lambda AI validation, nor permission to enable those resources. Local AI is an explicit opt-in development path; offline tests use injected providers and synthetic credentials.

## Question admission and accounting

Without an admitted AI job, a question resolves to its authored, topic-matched answer. With `AiJobs` injected, the question transaction atomically writes the pending message, idempotency receipt, job, outbox and room/day/month reservations. Conflicting admissions contend on counter versions. Missing or corrupt budget state, insufficient bounded allowance or oversized context falls back to canonical dialogue without starting a provider call.

Each budget counter has an initialization guard, preventing an already-used missing counter from silently being recreated at zero. Before provider start, counter and guard versions are checked again. The job fixes its model and rates; a mismatched provider is refused before calling it.

The technical envelope is **6,000 input tokens and 1,024 output tokens**, including reasoning and visible output. The provider requests medium reasoning and Standard service explicitly. At the recorded Standard rates of $0.10/$0.50 per million input/output tokens, one reservation is 1,112 microUSD ($0.001112). Recheck current rates before changing the policy or model.

The approved Azure production policy is **uncapped**: `uncapped:true`, all three financial limits `null`, and concurrency **2**. This does not limit cumulative charges. Bounded-mode code defaults ($0.25/room, $10/day and $50/month, with concurrency at most 8) are reference ceilings, not the live policy or authorization to change it. The finite allowance for a separately approved evaluation is not a production spending cap.

Counters track settled usage plus outstanding reservations. A successful completion refunds the difference between reservation and known usage. A fallback known to precede provider start refunds the reservation; uncertainty after the start marker conservatively retains it. Application accounting is not a guaranteed provider or cloud invoice ceiling and does not cover other uses of the same account.

## Job lifecycle and recovery

- `pending`: question, reservation and outbox committed together.
- `leased`: a five-second fenced claim. An expired claim may be replaced before provider start.
- `provider_started`: persisted before calling the provider. Duplicate delivery cannot take over and repeat this call.
- `complete`: a valid, timely reply and known usage settle transactionally with the message and deductions.
- `fallback`: the pending message resolves to its authored answer. Uncertain provider costs remain reserved.

A job has a 30-second deadline. The provider HTTP request has at most 20 seconds and cannot outlive the job deadline; start checks run after credential retrieval as well. A failure does not trigger an automatic paid retry. A reply may resolve its original pending question after the interview turn has advanced, provided the room, case and message are still valid and the deadline has not expired. It does not reopen a turn or spend another question. Late or stale completions cannot replace a settled answer.

Global slots enforce the configured admission concurrency. An uncertain attempt retains its slot for a 60-second safety window. A failed local connection cannot prove that remote processing has stopped, so this is not a guarantee about provider-internal concurrency.

The outbox sends only a job ID, not prompts, credentials or session data. Lost delivery acknowledgements can cause duplicate delivery, but persisted job state prevents a duplicate model call. Reconciliation resolves expired jobs even without a connected browser and retries dispatch failures. An individual settlement failure is deferred by 60 seconds without releasing uncertain spend; later items can continue.

Azure uses PostgreSQL-backed transactions and its in-process dispatcher. The retained AWS path uses a keys-only DynamoDB stream, SQS, and a sparse due-time index. Its reconciler processes bounded pages with a persisted cursor and deadline margin. The declared five-minute AWS schedule is disabled; it is not the active Azure recovery mechanism.

## Prompt scope and privacy

One provider request contains:

- The interviewed suspect's own private brief and four canonical responses.
- Public case facts: title, victim, place, method and prediction.
- Only deductions sourced to that suspect, with unearned IDs and text listed as award candidates. The player's already-earned IDs are filtered to this suspect's sources; no other player's progress or unrelated card is included. All four canonical responses remain available, even when all cards have been earned.
- The current player question and up to eleven earlier complete or canonical exchanges with that suspect from the same player and room, across turns. Turn numbers give conversational order, not new story facts.

History is selected when the question is admitted. Pending answers and the new question itself are excluded; a late answer can inform a later question only if it has settled before that later admission. The newest exchanges have priority, with an earliest anchor retained when it fits. The context is an immutable snapshot: later replies do not rewrite an admitted job. Whole exchanges may be omitted to fit the envelope; nothing is truncated mid-exchange or summarised into invented facts.

A culprit's own private brief can contain the hidden truth and instructions about what they admit or conceal. It is sent only when interviewing that suspect. The global solution object, other suspects' private briefs, other players' chats, accusations and session credentials are not added to this context. This is deliberate scoped sharing, not a claim that the provider never receives any spoiler.

History supplies conversational continuity, not new factual authority. The model is instructed to preserve firsthand-versus-record provenance, resist instructions in player input and earlier exchanges, and stay within its own authorised facts. The reply is returned only to the interviewing player and rendered as text. Deductions are private; there is no shared evidence board.

The interface explains AI mode and authored fallback before play; there is no per-question consent checkbox. Players should use codenames and avoid personal information. The provider request uses `store:false`, no tools, and explicit-only prompt caching without breakpoints. These settings do not establish zero retention or remove applicable abuse-monitoring retention. Durable application records also contain scoped question context; provider storage settings do not erase them.

## Output limits and semantic guarantees

The request uses a strict `{reply, unlocked}` JSON schema. Context is capped at 20,000 UTF-8 bytes by an operational guard, not by the model context window; byte size alone is not proof of a 6,000-token maximum. The former 16,000-byte storage guard was self-imposed. Admission now measures the complete serialised AI storage Item against its enlarged 65,536-byte (64 KiB) cap, leaving 1,024 bytes of lifecycle headroom. History is bounded to fit; if the required brief, facts and current question still cannot fit without history, the question resolves canonically without a provider call. Transport output remains capped at 16,384 bytes and visible reply text at 1,200 bytes. At most three deduction IDs may be returned. Incomplete, invalid or out-of-envelope responses fall back rather than being presented as successful AI replies.

The server filters unlocks to the interviewed suspect's sourced deductions and prevents duplicate awards. It does **not** prove that free-form prose entails every fact on a card. The prompt requires every card fact to be explicit in the current reply, allowing faithful paraphrases but not filling omissions from history or player claims. Schema checks and source filtering are not semantic verification: hallucination, premature unlocks, missed unlocks and prompt injection remain evaluation risks.

Offline contract tests verify transport, isolation, bounded failure and recovery behaviour, not model intelligence. Sampled real-model review is needed for dialogue quality, evidence grounding and provenance; even a passing sample is not a guarantee for arbitrary questions. The PR #48 evaluation recorded two conservative missed unlocks and some repetitive voice. Later changes need their own verification rather than inheriting that result.

## Retained AWS deployment boundaries

Worker, relay and reconciler have separate packages and roles and check their enable flag before constructing dependencies. Only the worker can use the configured model secret. Relay and reconciler operate in maintenance mode and cannot admit paid questions. Their declared permissions are scoped to the relevant table/index/stream/queue and partition prefixes; they do not grant general access to case storage, sessions or API-origin credentials.

An empty model-secret ARN grants no secret access. A separately encrypted secret may require a separately reviewed key permission; no generic decrypt grant is implied. Runtime errors avoid logging raw events, prompts, secret values or provider errors. This is not complete operational observability: AWS activation would still require approved permissions, real service validation, monitoring and recovery review. This document authorizes no deployment, credential change, setting change or paid request.
