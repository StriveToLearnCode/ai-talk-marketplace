# AI Talk Execution Protocols

Read only the sections needed by a contract-path task. These rules do not apply to a no-contract
Fast Path.

## User-visible experience

Use the same experience whether AI Talk was invoked implicitly or guaranteed by Strict Mode. After
the contract passes deterministic validation and before implementation or handoff, show at most:

```text
AI Talk · 已锁定
目标：<condense behavior into observable outcomes>
边界：<state read-only, bounded/excluded local scope, or exact external targets>
验收：<condense verification into observable checks>
```

For `inspect_only`, use `AI Talk · 已锁定为只读诊断`, state that code, configuration, and
external systems will not be modified, and replace `验收` with `完成标准：提供证据、结论和未验证项`.
For `clarify`, show `AI Talk · 需要锁定一个关键结果` and then the single decisive question;
do not show a provisional contract summary. Never expose route, authorization, schema fields, YAML,
or validator output.

During execution, mention AI Talk only when a boundary is activated, conflicts, blocks work, or is
revised. This includes starting a required scope snapshot, correcting an actual scope violation,
blocking a bounded-scope expansion, preserving read-only posture, or matching an external mutation
to its authorized targets. Do not brand ordinary search, analysis, tool use, or progress updates.

Every terminal `modify_and_verify` response must include `AI Talk 对账` and:

- list each requested outcome as `已完成`, `未完成`, or `未验证`;
- report a passed scope check only when scope guard evidence exists; otherwise list the actual changed
  files or modules without claiming protection;
- list each external mutation actually performed, if any;
- distinguish verified behavior from static checks and unverified runtime behavior.

Pure diagnosis reports evidence, conclusion, and unverified items without a modification-style
reconciliation block. Never claim success, boundary protection, or runtime verification without evidence.

## Contract validation

- After every contract creation or revision, run the bundled `scripts/contract-check.mjs validate`
  against its JSON-equivalent structure and the absolute project root.
- Fix deterministic schema, reference, target-evidence, and scope errors before `skip`, `handoff`, or
  `clarify`. Tool findings are construction errors, not user questions.
- Keep the returned verified-file index as runtime evidence outside the contract. Do not copy the
  validator report into `evidence` or expose it unless it explains a real blocker.

## Scope verification

- Put every explicit prohibition such as “不要改 core” in `excluded_scope`. Exclusions always win.
- Use `bounded` only when the user limits writes to named paths; otherwise use `discover`.
- Before the first edit with a non-empty `excluded_scope` or bounded policy, run
  `scripts/scope-guard.mjs snapshot` and keep its baseline outside the contract.
- When the snapshot starts, tell the user which explicit allowlist or exclusion is now being enforced.
- After edits, run `scope-guard.mjs verify` with every `--exclude`; bounded mode also passes each
  `--allow`. Correct this task's violations before completion. Never count pre-existing dirty files.
- If verification finds a violation, report the specific conflicting path as an active boundary event;
  correct it before completion or keep the task blocked.
- If a required write is excluded or outside bounded scope, keep `clarify` and ask only whether that
  exact expansion is allowed.

## External mutations

- `authorization: authorized` and `write_scope` apply only to the local repository. An empty local
  scope grants no permission to mutate anything else.
- Pagecenter releases or asset edits, database writes, GitHub mutations, cloud changes, messages, and
  every other external write require a matching `external_write_scope` item based on either a direct
  current-turn user command or a short affirmative reply to the immediately preceding exact proposal.
- An exact proposal names the external system, one operation, and every target, offers no competing
  option, and has no unresolved blocker. “是的/确认/执行” authorizes exactly that proposal; preserve the
  short reply verbatim in `authorization_quote`, revise the active contract, and continue without asking
  for a fixed phrase or restatement. Incomplete, stale, multi-option, or unrelated context does not qualify.
- A direct command that already binds the exact mutation needs no duplicate confirmation. When the user
  asks to review derived IDs or targets first, summarize the complete write scope once and accept the
  next unambiguous affirmative. Desired state, prior local authorization, and tool access are never sufficient.
- Read-only external inspection is allowed when needed for diagnosis. Before any external write, match
  the exact system, operation, and target to the authorized item; otherwise remain read-only.
- Treat a successful match or a rejected out-of-scope target as a boundary event. Report the exact
  system, operation, and targets without exposing authorization internals.

## Entry and control points

- `entry_point` is the line, button, template node, handler, or visible interaction supplied by the user.
- `control_point` is the first proven branch, callback, or state transition that decides whether or when
  the requested behavior occurs. Never copy the entry point as a fallback.
- Follow the call chain only far enough to establish the control point. Use `null` when unresolved.
- Express timing-sensitive behavior in execution order, for example: successful result -> animation
  completed -> play audio -> open reward dialog.

## Visual targets

- Read `target-binding.md` and create one stable `target_refs` item per screenshot annotation, selected
  DOM node, or independent page state.
- A visual target never automatically becomes a control point or writable path.
- Bind browser state read-only. Never click controls that claim, submit, pay, or confirm business data.
- Recapture stale browser context. If multiple targets remain plausible, use `clarify` rather than
  silently binding a similar element.

## Diagnosis

- A primary “找到”“定位”“哪里”“为什么”“排查”“分析”“解释”“前端还是后端” request and
  post-action “没变化” request use `inspect_only`; trailing defect details do not turn diagnosis into implementation.
- A bare normal-versus-broken observation without an implementation command or direct target behavior also uses
  `inspect_only`. Route “修复这个问题” and direct target behavior such as “中奖时播放音效” as implementation.
- Preserve decision-relevant evidence across the control, data, and rendering chain. UI diagnosis may
  inspect page state, actual condition values, DOM, geometry and occlusion, resources, and screenshots.
- Browser-unavailable results are `runtime_unverified`; source inference must not be presented as live
  evidence.
- When the user later authorizes the fix, revise the active contract to
  `modify_and_verify + authorized` and reuse evidence without broad retrieval.

## Verification

- Verify only observable results and real timing. Include success and failure branches only when the
  workflow actually has those business states.
- For unconditional interaction audio, verify effective-trigger count, timing, and preservation of the
  original interaction instead of inventing success/failure branches.
- Verify that original interaction remains usable and only add fallbacks the task actually requests.
- Never invent test commands, repository constraints, or results.

## Continuations

- `pass_through`: status, ordinary confirmation, locations, and context that changes no behavior or scope.
  A short affirmative to an immediately preceding exact external-write proposal is instead `revise`:
  populate only the proposed `external_write_scope`, validate, and execute without a second confirmation.
- `evidence_update`: a bare log, stack trace, console warning, or test failure with no current request.
  Immediately after an active or just-completed change, resume that same task's verification or diagnosis
  and preserve the evidence; otherwise release it as context. Never create a new task or authorize a new
  behavior change from the log alone.
- `behavior_report`: a normal-versus-broken comparison such as “A 正常，但 B 无法点击”. Without an explicit
  implementation command or direct target behavior, keep it `inspect_only`; it never implies local or external-write
  authorization. A later “修复” revises the same task instead of discarding collected evidence.
- A log explicitly promoted by “修复这个报错” or paired with acceptance criteria is a current implementation
  request, not a bare log. Preserve the log as evidence and route according to its actual scope and ambiguity.
- `revise`: behavior, scope, timing, visual target, verification, or authorization changes. Update the
  active contract in place and preserve stable target IDs and exclusions.
- `new_task`: an independently completable objective. Create a new contract without merging the old
  objective or write scope.
- “执行” after diagnosis changes mode and authorization but does not erase an unresolved blocker.
