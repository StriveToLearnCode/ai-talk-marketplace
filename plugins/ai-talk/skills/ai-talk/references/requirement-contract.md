# RequirementContract 1.2

Use this contract as AI Talk's only structured handoff. Preserve the exact keys and emit valid YAML only when the host cannot pass the contract directly to the next Skill.

## Shape

```yaml
schema_version: "1.2"
result: handoff
mode: modify_and_verify
authorization: authorized
source_request: 在中奖时播放音效
next_skill: gen-code
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
- Set `next_skill` to an installed Skill whose responsibility matches the mode. Use `gen-code` for ordinary code modification. Use `null` when no downstream Skill is needed or available.
- Store the user's selected line, annotated button, visible interaction, or mentioned handler in `entry_point`. It identifies where the request entered the conversation, not necessarily where code should change.
- Store screenshot annotations, selected DOM nodes, and current browser state in `target_refs`. Read `references/target-binding.md` for the exact shape. A visual target is not automatically a code control point or writable file.
- Store a location in `control_point` only when code or runtime evidence shows that it decides the requested timing or state transition. Never copy `entry_point` into it as a fallback. Use `null` when unresolved.
- Keep `write_scope` to evidence-supported files. An entry point is not automatically writable scope.
- Express `behavior` in execution order. Keep each item short.
- Store only decision-relevant facts in `evidence`, each with `type`, `summary`, and a concrete `source`.
- Store observable positive and negative checks in `verification`; include ordering when timing matters.
- Keep only implementation-changing blockers in `open_questions`. File names, symbols, repository conventions, and reusable implementations that the code Agent can locate are not questions.

## Result Selection

- Gate every user message in a development conversation before routing. Non-development conversations do not invoke AI Talk. A status question, confirmation, or other message in the active development conversation that does not need contract creation or revision is released unchanged to the current Agent. Do not add a gate field to this schema.
- `skip`: release. Intent, authorization, target behavior, and implementation direction are already clear. Do not retrieve extra context; pass the compact contract directly to `next_skill`.
- `handoff`: release after bounded enrichment. Retrieval found a real control point, reuse candidate, or implementation constraint that materially reduces downstream rediscovery.
- `clarify`: hold. At least two plausible answers would produce different user-visible behavior or write scope, and repository evidence cannot resolve the choice. Ask one decisive question and do not route yet.
- Evaluate each user message once. A released handoff must not invoke AI Talk again downstream.

## Routing

- Route event plus desired effect as `modify_and_verify + authorized`: “中奖时播放音效”, “动画完成后打开奖励弹窗”, and “点击 tab 时切换图片” are implementation requests.
- Route explicit imperatives such as “增加”, “改成”, “修复”, “接入”, or “做一下” as `modify_and_verify + authorized` when the requested outcome is identifiable.
- Route “为什么”, “定位原因”, “前端还是后端”, “只分析”, or “不要修改” as `inspect_only`. Do not recommend `gen-code` until the user asks to implement a fix.
- Route “先分析/出方案，确认后再改” as `plan_then_execute + inspect_only`.
- Do not treat missing implementation details as missing authorization. Ask only when the answer changes the product result or materially changes allowed scope.

## Continuation

- Preserve the same contract when the user corrects timing, scope, behavior, or a visual target. Update the affected fields, keep the original `source_request`, and preserve stable `target_refs` IDs for unchanged targets.
- When the user says “执行”, “开始执行”, or “按这个做” after an `inspect_only` or `plan_then_execute` result, switch to `modify_and_verify + authorized`, select the implementation Skill, and reuse confirmed evidence without repeating classification or broad retrieval.
- Preserve `target_refs` through routing and execution. If the active browser state no longer matches, recapture or block instead of silently binding a similar element.
- A hard blocker remains `clarify` until resolved; an execution word does not erase it.
