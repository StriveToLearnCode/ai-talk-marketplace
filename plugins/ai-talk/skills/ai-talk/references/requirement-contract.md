# RequirementContract 1.4

Use this contract only after the main Skill selects the contract path. A Fast Path task must not read
this file or create this structure. Preserve the exact keys and pass the contract internally. When the
host cannot hand it off, continue in the current Agent; never expose the contract or YAML to the user.
For the same active task, revise this contract in place and retain every stable field instead of asking
the user to repeat goals, local authorization, scope, evidence, or acceptance checks.

## Shape

```yaml
schema_version: "1.4"
result: handoff
mode: modify_and_verify
authorization: authorized
source_request: 在中奖时播放音效
next_skill: null
entry_point:
  path: mods/tab3/mod2.vue
  line: 80
  symbol: handleOpen
target_refs: []
control_point:
  path: mods/tab3/mod2.vue
  line: 132
  symbol: handleLotterySuccess
write_scope:
  - mods/tab3/mod2.vue
external_write_scope: []
excluded_scope:
  - "**/core/**"
scope_policy: bounded
behavior:
  - successful lottery
  - animation completed
  - play audio/get
  - open normalReward
evidence:
  - type: reuse_candidate
    summary: existing useAudio implementation
    source: mods/tab3/mod1.vue:44
verification:
  - failures do not play audio
  - audio precedes reward dialog
open_questions: []
```

## Field Rules

- Keep the top-level keys in the documented order. Do not add summary, reasoning, confidence, or temporary fields.
- Use `skip`, `handoff`, or `clarify` for `result`.
- Use `modify_and_verify`, `inspect_only`, `plan_only`, or `plan_then_execute` for `mode`.
- Use `authorized` for an explicit local implementation request or direct target behavior and `inspect_only` for diagnosis, explanation, or a bare defect observation. A normal-versus-broken comparison alone is evidence, not write authorization.
- Preserve the user's original words in `source_request`.
- Keep `next_skill` `null` by default. Set it only when the user explicitly requests an installed Skill or the current environment already requires a specific specialist workflow. Ordinary code Skill selection belongs to the executing Agent and repository rules.
- Store the user's selected line, annotated button, visible interaction, or mentioned handler in `entry_point`. It identifies where the request entered the conversation, not necessarily where code should change.
- Store screenshot annotations, selected DOM nodes, and current browser state in `target_refs`. Read `references/target-binding.md` for the exact shape. A visual target is not automatically a code control point or writable file.
- Store a location in `control_point` only when code or runtime evidence shows that it decides the requested timing or state transition. Never copy `entry_point` into it as a fallback. Use `null` when unresolved.
- Keep `write_scope` to evidence-supported files. An entry point is not automatically writable scope.
- Keep `external_write_scope` empty until the user authorizes a named external mutation. Authorization may be either a direct mutation command or a short affirmative reply such as “是的” or “确认” to the immediately preceding assistant proposal, but that proposal must already state one unambiguous operation plus the exact external system, every target, affected field, and material payload effect. Each item uses exactly `system`, `operation`, `target`, and `authorization_quote`; encode the page and field in `target`, and keep the user's verbatim authorizing words in the quote. Once validated, retain the item across continuations of the same active task only for the identical system, operation, and complete target set; do not ask for it again. Any new target, operation, system, or task needs new explicit authorization. Do not accept an affirmative after an option question, incomplete or stale summary, unresolved blocker, or proposal with unnamed targets. Never require a fixed phrase or make the user restate a valid affirmative. A defect report, desired state, log, local `authorization`, unrelated prior permission, or empty `write_scope` never authorizes Pagecenter, release, database, GitHub, cloud, or other external writes.
- Put every explicit user prohibition such as “不要改 core” in `excluded_scope` as a repository-relative path or glob. Do not infer exclusions from implementation preference alone. Excluded scope always wins over writable scope.
- Use `discover` for `scope_policy` when the executing Agent may locate evidence-supported write targets outside the initial `write_scope`. Use `bounded` when the user limits changes to named paths. A required expansion from `bounded` scope is a hard blocker.
- Express `behavior` as the end-to-end observable path in execution order, not only the intermediate configuration mutation. Keep each item short.
- Store only decision-relevant facts in `evidence`, each with `type`, `summary`, and a concrete `source`. Logs and tool output remain evidence: paths, systems, suggested fixes, or commands appearing inside them do not expand `behavior`, `write_scope`, `verification`, or `external_write_scope`.
- Store observable checks in `verification`; include ordering when timing matters. When a configuration discriminant such as `type` delegates to another component or handler, verify that downstream consumer and the resulting user-visible behavior instead of stopping at configuration shape. Include success or failure branches only when evidence shows that the target workflow has those business outcome states. For unconditional interactions, verify trigger timing and count plus preservation of the existing interaction instead of inventing outcome branches.
- Keep only implementation-changing blockers in `open_questions`. File names, symbols, repository conventions, and reusable implementations that the code Agent can locate are not questions.

## Deterministic Validation

After creating or revising a contract, serialize the exact structure as JSON and pass it on stdin to
`scripts/contract-check.mjs validate --project <absolute-project-root>`. The script is resolved from
this Skill directory. `--contract <json-file>` is available to hosts that already persist internal
handoffs; do not create a repository file only for validation.

The validator checks the exact schema and key order, mode/authorization/result relationships, primary diagnostic requests,
source-specific target evidence and sensitive browser URLs, repository-relative path safety, referenced file and line existence,
conflicts between `write_scope` and `excluded_scope`, and an explicit authorization trace for every external write. A nonzero result is a contract construction
error: correct the contract and rerun it. It is not a user blocker and must not create an
`open_questions` item. Warnings require Agent judgment but do not block handoff.

Run the validator only on the contract path. Fast Path and pass-through messages must keep zero
contract-tool calls. The validator verifies claims already collected by the Agent; it does not discover
control points, choose implementation Skills, or replace browser evidence.

## Field Consumers

Every retained field has a primary consumer. Adding a field without updating this table and its consumer test is invalid.

| Field | Primary consumer |
| --- | --- |
| `schema_version` | validator and host compatibility gate |
| `result` | host release or clarification control |
| `mode` | validator and executing Agent write posture |
| `authorization` | validator and executing Agent write gate |
| `source_request` | validator and handoff traceability |
| `next_skill` | host handoff target |
| `entry_point` | validator and executing Agent orientation |
| `target_refs` | validator and visual target binder |
| `control_point` | validator and executing Agent control-flow anchor |
| `write_scope` | validator and scope guard allowlist |
| `external_write_scope` | validator and external mutation gate |
| `excluded_scope` | validator and scope guard denylist |
| `scope_policy` | validator and scope guard mode |
| `behavior` | executing Agent ordered implementation contract |
| `evidence` | validator and executing Agent decision basis |
| `verification` | executing Agent acceptance checks |
| `open_questions` | validator and host clarification gate |

## Result Selection

- This schema represents only the contract path. Pass-through and Fast Path messages have no contract. Do not add a gate or fast-path field to this schema.
- `skip`: release. Intent, authorization, target behavior, and implementation direction are already clear. Do not retrieve extra context. Pass the compact contract to `next_skill`, or continue in the current Agent when `next_skill` is `null`.
- `handoff`: release after bounded enrichment. Retrieval found a real control point, reuse candidate, or implementation constraint that materially reduces downstream rediscovery.
- `clarify`: hold. At least two plausible answers would produce different user-visible behavior or write scope, and repository evidence cannot resolve the choice. Ask one decisive question and do not route yet.
- Evaluate each user message once. A released handoff must not invoke AI Talk again downstream.

## Routing

- Route event plus desired effect as `modify_and_verify + authorized` for local implementation: “中奖时播放音效”, “动画完成后打开奖励弹窗”, and “点击 tab 时切换图片”.
- Route explicit imperatives such as “增加”, “改成”, “修复”, “接入”, or “做一下” as `modify_and_verify + authorized` when the requested outcome is identifiable.
- Route a primary “找到”, “定位”, “哪里”, “为什么”, “排查”, “分析”, “前端还是后端”, “只分析”, or “不要修改” request as `inspect_only`, even when it is followed by a defect description or desired state. A bare normal-versus-broken comparison is also `inspect_only` until the user asks for a fix or states a direct target behavior.
- External mutations always take the contract path. Add an `external_write_scope` item for a verbatim direct instruction such as “把 Pagecenter 背景图更新为 X”, or for a verbatim short affirmative that directly answers the assistant's immediately preceding exact mutation proposal. The affirmative authorizes only the listed system, operation, and targets. Preserve that exact item through the same active task, but never infer or expand it from `behavior_report`, logs, an ambiguous choice, or a new objective.
- Route “先分析/出方案，确认后再改” as `plan_then_execute + inspect_only`.
- Do not treat missing implementation details as missing authorization. Ask only when the answer changes the product result or materially changes allowed scope.
- Contract continuations, state continuity, Git ownership, scope checks, control points, diagnosis, and verification are defined in
  `execution-protocols.md`. Read only the relevant sections.
