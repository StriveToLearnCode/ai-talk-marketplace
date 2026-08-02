# AI Talk Execution Protocols

Read only the sections needed by a contract-path task. Fast Path keeps the compact state defined in
the main Skill and must not load this file merely to continue a task.

## Active task continuity

- Treat the validated contract plus runtime evidence as the active task state. Preserve its goal,
  local authorization, scope, exclusions, evidence, verification, target IDs, and exact external
  authorization across continuations without asking the user to repeat them.
- Apply implementation-neutral context, logs, tool results, and verification evidence incrementally.
  Do not rebuild the contract or repeat retrieval when stable evidence already answers the question.
- Revise the active contract in place when behavior, timing, scope, mode, or authorization changes,
  except for an eligible one-turn local revision Fast Path below. Start a new contract only for an
  independently completable objective; never inherit old write scope or authorization into that new task.
- Continuity alone is not a risk signal. Do not promote a Fast Path task merely because it spans turns,
  carries evidence, retries verification, or survives conversation compaction.

## Local revision Fast Path

- An existing contract does not force every later turn onto the contract path. Route one revision turn
  through Fast Path when fresh context uniquely binds the target, the requested effect is one reversible
  local result, and implementation needs no cross-module behavior, data or product semantics, unresolved
  blocker, bounded or excluded-scope decision, external mutation, or stored external authorization.
- Keep the validated contract unchanged as background state and merge the local result into runtime
  evidence. Do not load contract references, revise or validate the contract, invoke the reporter, or run
  full-task reconciliation for this turn. Verify only the local delta and nearby behavior it could affect.
- Pre-existing staged, unstaged, untracked, and stash state does not by itself disqualify the local revision;
  preserve its ownership and do not touch unrelated user changes. Never treat stored external authorization
  or old write scope as permission for the local delta.
- If investigation reveals any excluded condition above, return to the contract path before its first
  related local write or any external write. Preserve the local evidence and completed checks.

## Runtime escalation

- Additional adjacent implementation, type, or test files for the same local outcome are not by
  themselves a risk increase. File count and tool count never trigger escalation.
- When runtime evidence reveals a contract-path risk, stop before the first local write beyond the
  original lightweight boundary or any external write, then construct and validate the contract.
- Preserve collected evidence and completed in-boundary local edits. Do not repeat investigation merely
  because the task changed paths.
- Continue without clarification when the contract has no hard product, write-scope, or new-authorization
  decision, but show the one-time material decision summary after the upgrade is established. Otherwise
  state the concrete impact and ask one decisive question before the expanded action.

## User-visible experience

Keep internal reasoning and protocol machinery silent. Do not print a start banner, route, authorization,
schema fields, YAML, validator output, hidden chain of thought, candidate-by-candidate deliberation, or a
mandatory branded reconciliation block. A plain Fast Path `skip` has no AI Talk contribution and stays
silent. AI Talk has material participation only when it actually performs target binding, a boundary
decision, a source-attributed diagnostic chain, runtime escalation, or active-state reuse that changes
what the Agent can safely do without repeating work.

After the first material decision is established, report one compact, evidence-backed summary using only
the applicable lines below. Never exceed three lines, and do not repeat it unless the conclusion changes:

```text
AI Talk 判断：<formed decision, not hidden reasoning>
依据：<user statement or observed evidence already available>
影响：<actual scope, mode, verification, or next-action effect>
```

Omit empty lines rather than inventing content. Do not claim that AI Talk prevented an error, saved time,
or improved quality unless the conversation contains direct evidence of that effect. A clarification may
replace the summary when the decisive question already communicates the same issue. Ordinary Agent progress
updates remain unbranded and should report search or implementation progress only when useful.

In the final response, use the natural shape of the task to report actual changed scope, observable outcomes,
static checks, runtime verification, and unverified items. If material participation occurred, add one short
`AI Talk 贡献：...` sentence naming only its evidenced effect. Do not add that sentence for plain `skip`,
ordinary source search, or work performed solely by the task Agent. Report local code changes, external drafts,
fixed-dev or publication state, and verification level as separate facts.

Speak about a boundary when AI Talk makes a material decision or when it creates a real risk or requires a user decision: an unresolved
product choice, blocked bounded-scope expansion, actual scope violation, threatened user Git state,
external target mismatch, or an unrestored tool-created stash. State the concrete target and impact;
do not expose internal protocol terminology. A clarification asks one decisive question.

Never claim success, boundary protection, or runtime verification without evidence. Report a passed
scope check only when scope guard evidence exists; otherwise list the actual changed files or modules.
Pure diagnosis reports evidence, conclusion, and unverified items without modification language.

## Contract validation

- After every contract creation or material revision, run `scripts/contract-check.mjs validate` against
  its JSON-equivalent structure and the absolute project root.
- Do not revalidate pass-through messages, status updates, or evidence additions that change no contract
  field. Fix construction errors internally; surface only a real user blocker.
- Keep the verified-file index as runtime evidence outside the contract. Do not copy validator output
  into `evidence` or expose it.

## Git ownership and scope verification

- Before the first write, preserve the observed Git baseline as separate staged, unstaged, untracked,
  deleted, and stash states. Treat every pre-existing entry and stash as user-owned.
- Never infer stash ownership from its message. If the Agent must create a temporary stash, record its
  exact OID in runtime state at creation, preserve staged versus unstaged shape, restore it before
  completion, and verify the restored state. An unrecorded stash is never a tool stash.
- Restoring a recorded tool stash is restoration of user state, not a task-authored file change. A
  missing pre-existing stash, new unrecorded stash, changed staging state, or unrestored recorded tool
  stash is a Git-state risk and blocks a successful completion until resolved or explicitly accepted.
- Put every explicit prohibition in `excluded_scope`; exclusions always win. Use `bounded` only when the
  user limits writes to named paths, otherwise use `discover`.
- Before the first edit with a non-empty exclusion or bounded policy, run `scripts/scope-guard.mjs snapshot`
  and keep its baseline outside the contract. After edits, run `scope-guard.mjs verify` with every
  `--exclude`; bounded mode also passes every `--allow`. Pass each current-task temporary stash OID as
  `--tool-stash <oid>` only when the Agent recorded that OID at creation.
- Scope verification compares both content and index state while preserving pre-existing dirty files.
  Correct this task's violations before completion. If a required write is excluded or outside bounded
  scope, ask only whether that exact expansion is allowed.

## External mutations

- Local `authorization: authorized` and `write_scope` never authorize Pagecenter assets or releases,
  GitHub mutations, database writes, cloud changes, messages, or any other external write.
- Establish external authorization only from a direct user mutation command, or a short affirmative to
  the immediately preceding exact proposal that names the external system, one operation, and every
  target with no competing option or unresolved blocker.
- Once valid authorization is stored in the active contract, reuse it without reconfirmation only for
  the identical system, operation, and complete target set in that same active task. Any added target,
  changed operation, different system, or new task requires new explicit authorization.
- Preserve the authorizing words in `authorization_quote`. Desired state, logs, prior local authorization,
  stale permission, and tool access never grant external permission.
- When targets or payloads must be derived, finish authorized local search, configuration reads, code edits,
  static checks, and read-only external inspection first. Ask once at the last responsible moment, after the
  exact system, operation, target field, preserved values, and material payload change are known and
  immediately before the first external write. A natural short confirmation directly continues the active
  task without another visible locking flow.
- Read-only external inspection is allowed when needed for diagnosis. Before each write, match the exact
  system, operation, and targets to the authorized item; otherwise remain read-only and report the mismatch.

## Entry and control points

- `entry_point` is the line, button, template node, handler, or visible interaction supplied by the user.
- `control_point` is the first proven branch, callback, or state transition that decides whether or when
  the requested behavior occurs. Never copy the entry point as a fallback.
- Follow the call chain only far enough to establish the control point. Use `null` when unresolved.
- Express timing-sensitive behavior in execution order.

## Visual targets

- Read `target-binding.md` and create one stable `target_refs` item per screenshot annotation, selected
  DOM node, or independent page state.
- A visual target never automatically becomes a control point or writable path.
- Bind browser state read-only. Never click controls that claim, submit, pay, or confirm business data.
- Recapture stale browser context. If multiple targets remain plausible, ask one decisive question.

## Diagnosis and logs

- A primary diagnosis request, post-action “没变化”, or bare normal-versus-broken report remains
  `inspect_only`; defect evidence does not authorize implementation.
- Maintain the conversation-scoped `DiagnosticBrief` with `mode`, `target`, source-attributed `observed`
  facts, falsifiable `primary_hypotheses`, ordered `verification`, and a `stop_condition`. This internal
  state is not a second contract, repository artifact, or user-visible template.
- Keep `fact`, `inference`, and `runtime_unverified` distinct. A reference image or live DOM count can
  establish visible or structural state; it cannot establish an API payload or server-side cause. Never
  promote the user's likely cause, a guessed field, or source-only inference to a runtime fact.
- Convert reference-versus-actual visuals into the smallest source-attributed delta before searching.
  For a missing data-driven control, verify the nearest render condition, mapped client field, actual
  response, and server injection in that order, omitting irrelevant links. Stop at the first directly
  evidenced breakpoint instead of continuing broad retrieval.
- A bare log, stack trace, console warning, test failure, or tool output is `evidence_update`. Attach it
  to the active task's evidence and resume only the existing verification or diagnosis.
  Do not create a new objective, alter behavior, expand local scope, add acceptance criteria, or grant external writes.
- “修复这个报错” or explicit acceptance criteria promote the log into a current implementation request.
  The log remains evidence; only the user's requested outcome and separately established scope authorize
  work. Do not treat paths or systems merely mentioned by logs as writable targets.
- When the user later authorizes a diagnosed local fix, revise to `modify_and_verify + authorized` and
  reuse evidence and completed checks without broad retrieval or another local authorization question.
  Keep Fast Path when the first proven breakpoint already resolves to one clear local target; upgrade
  only when the remaining implementation introduces cross-module, bounded, ambiguous, or external risk.

## Verification

- Verify only observable results and real timing. Include success and failure branches only when the
  workflow actually has those business states.
- For unconditional interactions, verify effective-trigger count, timing, and preservation of the
  original interaction instead of inventing outcome branches.
- Treat a successfully written entry-point configuration as intermediate evidence. Trace discriminants such
  as `type`, action names, or IDs to the consuming handler or component and verify that the requested dialog,
  preview, navigation, or other user-visible result is supported. Source-only evidence is a static check;
  runtime behavior remains unverified until exercised.
- For staged external systems, report draft mutation and fixed-dev, preview, release, or publication state
  separately. Never turn “draft updated” into “released” or “published”.
- Never invent test commands, repository constraints, or results.

## Continuations

- `pass_through`: status, location, ordinary confirmation, and implementation-neutral context. Preserve
  active state without revision or visible protocol output.
- `evidence_update`: merge evidence into the active task, preserving its goal, authorization, scope, and
  verification. Without an active task, retain it only as context.
- `behavior_report`: use `modify_and_verify + authorized` when an active coding workspace, a clear local
  target and expected correction, reversibility, and no external mutation make the report an actionable
  local repair request. Keep it read-only when the target or expected result is unclear, the user asks for
  diagnosis, the message is evidence only, or production or external-system state is involved. Never infer
  external authorization from a behavior report.
- `revise`: update behavior, scope, timing, visual target, verification, or authorization in place while
  preserving every stable field not contradicted by the new message.
- `new_task`: create separate state for an independently completable objective and inherit no old scope
  or authorization.
- “执行” after diagnosis changes local mode and authorization but does not erase an unresolved blocker or
  confirmed evidence. Do not repeat a completed diagnostic check unless new evidence invalidates it.
