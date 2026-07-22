# AI Talk Plugin

AI Talk 是研发对话中每条用户消息的单一前置门禁。非研发对话不触发；研发对话中的状态询问和确认原样放行，研发任务将用户原话、代码入口、视觉目标和必要仓库证据编译为 `RequirementContract 1.2`，再决定直接放行、增强后放行或暂不放行。

运行规则：

1. 明确目标行为直接视为实施请求，使用 `modify_and_verify + authorized`。
2. 只分析、原因定位和前后端归属保持 `inspect_only`；用户随后说“执行”时复用契约转入实施。
3. `entry_point` 只保存用户标注入口；`control_point` 和 `write_scope` 必须由代码或运行态证据确认。
4. 截图标注、选中 DOM 和当前浏览器页面写入稳定 `target_refs`，不与根因 evidence 混用。
5. 视觉上下文绑定保持只读，敏感 URL 参数必须移除；陈旧或多义目标只问一个决定性问题。
6. 默认在后台把紧凑契约交给匹配的下游 Skill；宿主不能直接 handoff 时才显示 YAML。
7. 研发对话中的每条用户消息只判断一次；状态询问和确认不创建空契约，下游 Skill 不回调 AI Talk。

```text
这里的第二个头像也加上同样的动效
```

若当前 DOM 选择可以唯一定位该头像，AI Talk 直接保存稳定 selector、1-based ordinal、DOM fingerprint 和匹配的浏览器状态；不会要求用户重新描述，也不会把选中节点直接当作代码修改点。

安装后用户在研发对话中只需正常说话，AI Talk 会自动先判断放行与否。非研发对话不触发；`$ai-talk:...` 仅保留为兼容的显式调用方式。

`skills/ai-talk/scripts/route-company-skills.mjs` 与 `references/legacy-router.md` 仅用于 legacy CLI 兼容和历史测试。
