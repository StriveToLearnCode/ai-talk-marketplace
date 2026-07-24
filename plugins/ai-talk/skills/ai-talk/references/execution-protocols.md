# AI Talk Execution Protocols

Read only the sections needed by a contract-path task. These rules do not apply to a no-contract
Fast Path.

## Scope verification

- Put every explicit prohibition such as “不要改 core” in `excluded_scope`. Exclusions always win.
- Use `bounded` only when the user limits writes to named paths; otherwise use `discover`.
- Before the first edit with a non-empty `excluded_scope` or bounded policy, run
  `scripts/scope-guard.mjs snapshot` and keep its baseline outside the contract.
- After edits, run `scope-guard.mjs verify` with every `--exclude`; bounded mode also passes each
  `--allow`. Correct this task's violations before completion. Never count pre-existing dirty files.
- If a required write is excluded or outside bounded scope, keep `clarify` and ask only whether that
  exact expansion is allowed.

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

- “为什么”“排查”“定位原因”“前端还是后端” and post-action “没变化” requests use `inspect_only`.
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

- `pass_through`: status, confirmation, locations, and context that changes no behavior or scope.
- `evidence_update`: a bare log, stack trace, console warning, or test failure with no current request.
  Immediately after an active or just-completed change, resume that same task's verification or diagnosis
  and preserve the evidence; otherwise release it as context. Never create a new task or authorize a new
  behavior change from the log alone.
- `behavior_report`: a normal-versus-broken comparison such as “A 正常，但 B 无法点击”. When the affected
  target is uniquely bound, treat the observable fix as `modify_and_verify + authorized`; do not require an
  imperative verb.
- A log explicitly promoted by “修复这个报错” or paired with acceptance criteria is a current implementation
  request, not a bare log. Preserve the log as evidence and route according to its actual scope and ambiguity.
- `revise`: behavior, scope, timing, visual target, verification, or authorization changes. Update the
  active contract in place and preserve stable target IDs and exclusions.
- `new_task`: an independently completable objective. Create a new contract without merging the old
  objective or write scope.
- “执行” after diagnosis changes mode and authorization but does not erase an unresolved blocker.
