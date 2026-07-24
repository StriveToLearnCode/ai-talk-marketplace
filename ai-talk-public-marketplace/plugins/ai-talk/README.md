# AI Talk Plugin

AI Talk 默认自动匹配研发请求，并提供可选的仓库严格模式。严格模式通过托管的根 `AGENTS.md` 规则要求每条研发消息先应用 AI Talk；非研发对话不触发。状态询问、引用记录和确认原样放行；明确、可逆、局部且目标已解析的任务走无契约 Fast Path，只有未解析的视觉指代、引用提升、跨模块、范围限制、诊断续接或产品歧义才生成 `RequirementContract 1.3`。

运行规则：

1. 明确目标行为直接视为实施请求，使用 `modify_and_verify + authorized`。
2. 只分析、原因定位和前后端归属保持 `inspect_only`；用户随后说“执行”时复用契约转入实施。
3. `entry_point` 只保存用户标注入口；`control_point` 和 `write_scope` 必须由代码或运行态证据确认；`excluded_scope` 保存用户明确禁止修改的路径。
4. 截图标注、选中 DOM 和当前浏览器页面写入稳定 `target_refs`，不与根因 evidence 混用。
5. 视觉上下文绑定保持只读，敏感 URL 参数必须移除；陈旧或多义目标只问一个决定性问题。
6. Fast Path 不读取 reference、不检索仓库、不生成契约或 YAML，也不选择普通实现 Skill。
7. 默认模式依赖 Skill 隐式匹配；严格模式保证研发对话中的每条用户消息只判断一次。状态询问和确认不创建空契约，下游 Skill 不回调 AI Talk。
8. Agent 主流程不运行反馈资格 reporter；安装后的 Stop Hook 或宿主适配器只处理带契约任务 ID、contract 路由和终态 outcome 的任务。
9. 契约默认 `next_skill: null`；普通代码 Skill 与项目流程由执行 Agent 和仓库规则决定。
10. 有禁止范围或 `bounded` 写范围时，使用 `scripts/scope-guard.mjs` 比较本轮前后变化并拦截越界文件。
11. Fast Path 永不触发 reporter。可选项目 Hook 处理契约任务抽样和显式错误的脱敏元数据；只有配置 HTTPS 端点且设置 `AI_TALK_FEEDBACK_CONSENT=1` 才远端发送。
12. 文件行号、IDE 选区、唯一业务 ID、已绑定 DOM 或截图标注能够唯一确定目标时，指代词不单独触发契约。
13. 正常对象与异常对象的对比属于授权修复的行为缺陷；裸日志只恢复同一任务的验证或诊断，不授权新的行为修改。

```text
这里的第二个头像也加上同样的动效
```

若当前 DOM 选择可以唯一定位该头像，AI Talk 直接保存稳定 selector、1-based ordinal、DOM fingerprint 和匹配的浏览器状态；不会要求用户重新描述，也不会把选中节点直接当作代码修改点。

安装后用户在研发对话中只需正常说话。需要逐轮强制前置时，运行 `node scripts/install-strict-mode.mjs --project /绝对项目路径`，然后新建 Codex 任务。非研发对话不触发；`$ai-talk:...` 仅保留为兼容的显式调用方式。

`skills/ai-talk/scripts/route-company-skills.mjs` 与 `references/legacy-router.md` 仅用于 legacy CLI 兼容和历史测试。

`scripts/install-strict-mode.mjs` 只维护 `AGENTS.md` 中带标记的 AI Talk 区块，支持 `--check`、`--dry-run` 和 `--remove`，不会覆盖其他项目规则。反馈实现位于 `scripts/feedback-*.mjs`；Codex 不保证从插件或 Skill 自动发现 Hook。需要运行时反馈资格判断时，显式运行 `node scripts/install-feedback-hooks.mjs --project /绝对项目路径`，并由宿主提供 `ai_talk_task_id`、`ai_talk_route: contract` 与 `ai_talk_outcome`。
