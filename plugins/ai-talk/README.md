# AI Talk Plugin

AI Talk 默认自动匹配研发请求，并提供可选的仓库严格模式。严格模式通过托管的根 `AGENTS.md` 规则要求每条研发消息先应用 AI Talk；非研发对话不触发。状态询问和确认原样放行，研发任务将用户原话、代码入口、视觉目标和必要仓库证据编译为 `RequirementContract 1.2`，再决定直接放行、增强后放行或暂不放行。

运行规则：

1. 明确目标行为直接视为实施请求，使用 `modify_and_verify + authorized`。
2. 只分析、原因定位和前后端归属保持 `inspect_only`；用户随后说“执行”时复用契约转入实施。
3. `entry_point` 只保存用户标注入口；`control_point` 和 `write_scope` 必须由代码或运行态证据确认。
4. 截图标注、选中 DOM 和当前浏览器页面写入稳定 `target_refs`，不与根因 evidence 混用。
5. 视觉上下文绑定保持只读，敏感 URL 参数必须移除；陈旧或多义目标只问一个决定性问题。
6. 默认在后台把紧凑契约交给匹配的下游 Skill；宿主不能直接 handoff 时才显示 YAML。
7. 默认模式依赖 Skill 隐式匹配；严格模式保证研发对话中的每条用户消息只判断一次。状态询问和确认不创建空契约，下游 Skill 不回调 AI Talk。
8. AI Talk 路由的任务到达终态后先检查反馈资格；异常终态全量、成功终态默认采样 20%，没有已同意的端点时默认不询问。反馈使用独立 `FeedbackEnvelope 1.0`，不改变 RequirementContract。
9. 可选项目 Hook 只记录工具显式错误的脱敏元数据。显式提交或发送失败的反馈使用并发安全的本地 spool；只有配置 HTTPS 端点且设置 `AI_TALK_FEEDBACK_CONSENT=1` 才远端发送。

```text
这里的第二个头像也加上同样的动效
```

若当前 DOM 选择可以唯一定位该头像，AI Talk 直接保存稳定 selector、1-based ordinal、DOM fingerprint 和匹配的浏览器状态；不会要求用户重新描述，也不会把选中节点直接当作代码修改点。

安装后用户在研发对话中只需正常说话。需要逐轮强制前置时，运行 `node scripts/install-strict-mode.mjs --project /绝对项目路径`，然后新建 Codex 任务。非研发对话不触发；`$ai-talk:...` 仅保留为兼容的显式调用方式。

`skills/ai-talk/scripts/route-company-skills.mjs` 与 `references/legacy-router.md` 仅用于 legacy CLI 兼容和历史测试。

`scripts/install-strict-mode.mjs` 只维护 `AGENTS.md` 中带标记的 AI Talk 区块，支持 `--check`、`--dry-run` 和 `--remove`，不会覆盖其他项目规则。反馈实现位于 `scripts/feedback-*.mjs`；`hooks.example.json` 只是项目级 Stop 增强示例，Codex 不保证从插件或 Skill 自动发现 Hook。需要补问安全网时，显式运行 `node scripts/install-feedback-hooks.mjs --project /绝对项目路径`。工具错误只有宿主附带 `ai_talk_task_id` 时才允许归因给 AI Talk。
