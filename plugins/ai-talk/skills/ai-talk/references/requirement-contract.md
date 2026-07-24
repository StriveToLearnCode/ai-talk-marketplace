# RequirementContract 1.3

Use this contract only after the main Skill selects the contract path. A Fast Path task must not read
this file or create this structure. Preserve the exact keys and emit valid YAML only when the host
cannot pass the contract internally.

## Shape

```yaml
schema_version: "1.3"
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
- Use `authorized` for an implementation request and `inspect_only` for diagnosis or explanation. A desired behavior is an implementation request even when the user omits verbs such as “修改” or “实现”.
- Preserve the user's original words in `source_request`.
- Keep `next_skill` `null` by default. Set it only when the user explicitly requests an installed Skill or the current environment already requires a specific specialist workflow. Ordinary code Skill selection belongs to the executing Agent and repository rules.
- Store the user's selected line, annotated button, visible interaction, or mentioned handler in `entry_point`. It identifies where the request entered the conversation, not necessarily where code should change.
- Store screenshot annotations, selected DOM nodes, and current browser state in `target_refs`. Read `references/target-binding.md` for the exact shape. A visual target is not automatically a code control point or writable file.
- Store a location in `control_point` only when code or runtime evidence shows that it decides the requested timing or state transition. Never copy `entry_point` into it as a fallback. Use `null` when unresolved.
- Keep `write_scope` to evidence-supported files. An entry point is not automatically writable scope.
- Put every explicit user prohibition such as “不要改 core” in `excluded_scope` as a repository-relative path or glob. Do not infer exclusions from implementation preference alone. Excluded scope always wins over writable scope.
- Use `discover` for `scope_policy` when the executing Agent may locate evidence-supported write targets outside the initial `write_scope`. Use `bounded` when the user limits changes to named paths. A required expansion from `bounded` scope is a hard blocker.
- Express `behavior` in execution order. Keep each item short.
- Store only decision-relevant facts in `evidence`, each with `type`, `summary`, and a concrete `source`.
- Store observable checks in `verification`; include ordering when timing matters. Include success or failure branches only when evidence shows that the target workflow has those business outcome states. For unconditional interactions, verify trigger timing and count plus preservation of the existing interaction instead of inventing outcome branches.
- Keep only implementation-changing blockers in `open_questions`. File names, symbols, repository conventions, and reusable implementations that the code Agent can locate are not questions.

## Result Selection

- This schema represents only the contract path. Pass-through and Fast Path messages have no contract. Do not add a gate or fast-path field to this schema.
- `skip`: release. Intent, authorization, target behavior, and implementation direction are already clear. Do not retrieve extra context. Pass the compact contract to `next_skill`, or continue in the current Agent when `next_skill` is `null`.
- `handoff`: release after bounded enrichment. Retrieval found a real control point, reuse candidate, or implementation constraint that materially reduces downstream rediscovery.
- `clarify`: hold. At least two plausible answers would produce different user-visible behavior or write scope, and repository evidence cannot resolve the choice. Ask one decisive question and do not route yet.
- Evaluate each user message once. A released handoff must not invoke AI Talk again downstream.

## Routing

- Route event plus desired effect as `modify_and_verify + authorized`: “中奖时播放音效”, “动画完成后打开奖励弹窗”, and “点击 tab 时切换图片” are implementation requests.
- Route explicit imperatives such as “增加”, “改成”, “修复”, “接入”, or “做一下” as `modify_and_verify + authorized` when the requested outcome is identifiable.
- Route “为什么”, “定位原因”, “前端还是后端”, “只分析”, or “不要修改” as `inspect_only`.
- Route “先分析/出方案，确认后再改” as `plan_then_execute + inspect_only`.
- Do not treat missing implementation details as missing authorization. Ask only when the answer changes the product result or materially changes allowed scope.
- Contract continuations, scope checks, control points, diagnosis, and verification are defined in
  `execution-protocols.md`. Read only the relevant sections.
