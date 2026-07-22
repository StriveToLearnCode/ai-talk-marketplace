# RequirementContract 1.0

Use this contract as the only structured handoff for the normal `$ai-talk` conversation. Preserve the exact top-level keys and emit valid JSON in a fenced `json` block.

## Shape

```json
{
  "schemaVersion": "1.0",
  "status": "ready_to_execute",
  "authorization": "pending",
  "sourceRequest": "这两部分的用户头像都需要 pag/user 溜光",
  "mode": "clarification",
  "scope": ["recharge", "voice"],
  "target": "用户头像",
  "effect": "pag/user",
  "instanceModel": "per_target",
  "playback": "loop",
  "constraints": [
    {"text": "每个 PAG name 唯一", "source": "derived"},
    {"text": "动画层不拦截头像点击", "source": "derived"}
  ],
  "acceptance": [
    {"text": "recharge、voice 中所有用户头像均持续播放溜光", "source": "clarification"},
    {"text": "多个头像同时使用独立实例循环播放", "source": "clarification"},
    {"text": "列表切换或数据刷新后动画仍正常", "source": "derived"},
    {"text": "PAG 层不影响头像原有点击", "source": "derived"},
    {"text": "资源加载失败时页面不阻塞且头像仍可用", "source": "derived"}
  ],
  "evidence": [],
  "openQuestions": []
}
```

## Field rules

- Keep the top-level keys in the documented order; do not add temporary fields.
- Use `clarifying`, `diagnosing`, `ready_to_execute`, `executing`, `verifying`, `done`, or `blocked` for `status`.
- Use `pending` or `authorized` for `authorization`. Only an explicit execution instruction authorizes implementation.
- Use `clarification` or `diagnosis` for `mode`.
- Preserve the original request in `sourceRequest`; do not replace it with a rewritten goal.
- Use `null` for an inapplicable or unresolved scalar and `[]` for an empty list.
- Keep `scope` as strings that identify user-visible areas or behaviors. Keep `target` as a stable plain-language target in P0.
- Store constraints and acceptance criteria as `{ "text": string, "source": source }`.
- Use only `user`, `clarification`, `derived`, or `diagnostic` for `source`.
- Store diagnostic evidence as `{ "type": string, "summary": string, "source": "diagnostic" }`. Do not store unsupported causes as evidence.
- Keep only unresolved, implementation-changing questions in `openQuestions`. Never repeat a resolved question.

## Transitions

```text
clarifying -> ready_to_execute -> executing -> verifying -> done
diagnosing -> ready_to_execute -> executing -> verifying -> done
clarifying | diagnosing -> blocked
blocked -> clarifying | diagnosing | ready_to_execute
```

- Set `ready_to_execute` only when `openQuestions` is empty and the contract contains observable acceptance criteria.
- On `执行`, `开始执行`, or `按这个做`, transition `ready_to_execute + pending` to `executing + authorized`. Preserve every confirmed field and diagnostic evidence, then let the current code Agent implement and verify without another clarification or authorization question.
- Do not transition from `clarifying` or `blocked` while an implementation-changing question or external prerequisite remains. Ask only for that missing item.
- Treat a later explicit execution instruction as new authorization even when the original request asked for diagnosis only.
- Update the current contract in place when the user answers or corrects a field. Start a new contract only for an explicitly different task.

## Acceptance derivation

Add only applicable, observable criteria. Check scope coverage, independent or concurrent behavior, refresh or remount behavior, preservation of existing interactions, and recoverable dependency or resource failure. Mark criteria not stated by the user as `derived`; do not invent product behavior that changes the requested result.
