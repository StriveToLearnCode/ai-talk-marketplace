# AI Talk

AI Talk 是自动匹配研发请求的风险分级门禁。默认模式无需命令前缀，但是否触发由 Codex 的 Skill 匹配决定；需要每条研发消息都先经过 AI Talk 时，可为目标仓库安装 Strict Mode。状态询问和仅引用记录原样放行，明确、可逆、局部且目标已解析的任务走无契约 Fast Path，复杂任务才加载 `RequirementContract 1.3`。

```text
默认自动匹配 / 仓库严格模式
→ AI Talk 前置判断（每条消息最多一次）
→ 状态询问 / 确认：原样放行
→ 明确局部任务：Fast Path，无契约直接放行
→ 复杂研发任务：skip / handoff 契约后放行
→ 硬阻塞：clarify，暂不放行
```

AI Talk 只询问会改变产品结果、数据语义或允许写入范围的硬问题。明确的目标行为本身就是修改意图，不需要再次询问授权；用户要求“为什么”“只分析”时保持 `inspect_only`，随后说“执行”则复用原契约转入实施。

Fast Path 不读取协议 reference、不为 AI Talk 检索仓库、不生成 YAML、不选择普通实现 Skill，也不运行反馈 reporter。未解析的视觉指代、引用提升、跨模块、明确范围限制、诊断续接或产品歧义才进入契约路径。行为缺陷报告在目标已解析时直接授权修复；裸日志只恢复上一任务的验证或诊断，不授权新的行为修改。`excluded_scope` 保存“不要改 core”等禁止范围，`bounded` 范围会通过前后工作区快照校验。

Agent 主流程不检查反馈资格。显式安装的 Stop Hook 或宿主适配器只有在收到契约任务 ID、contract 路由和终态 outcome 时才负责抽样；Fast Path 不触发 reporter。反馈经过字段白名单与脱敏后进入本地 spool，只有配置 HTTPS 端点并设置 `AI_TALK_FEEDBACK_CONSENT=1` 时才会远端发送。

## 视觉目标

“这里”“这两部分”“第二个头像”等指代会先尝试由文件行号、IDE 选区、唯一业务 ID、DOM 或截图标注稳定绑定。只有仍存在多个合理候选时才进入视觉契约；视觉目标会保存为稳定 `target_refs`：

- 截图标注保存附件、标注 ID、归一化边界和原图尺寸。
- 选中 DOM 保存当前页面状态、稳定 selector、ordinal 和 DOM fingerprint。
- 当前浏览器页面保存脱敏 URL、route、视口、frame path 和可观察状态。

视觉目标只是入口证据，不自动成为代码 `control_point` 或 `write_scope`。上下文缺失、陈旧或有多个候选时，AI Talk 只请求一次选择、截图标注或 DOM 选择，不根据代码和相似外观猜测。

## 安装

```bash
codex plugin marketplace add /绝对路径/ai-talk-public-marketplace
codex plugin add ai-talk@ai-talk-marketplace
```

为某个仓库启用逐轮前置的 Strict Mode：

```bash
node /绝对路径/ai-talk/scripts/install-strict-mode.mjs --project /绝对项目路径
```

```text
这两处标注的用户头像都加上 pag/user 溜光
```

安装后用户在研发对话中只需正常说话。默认模式自动匹配；严格模式通过仓库 `AGENTS.md` 强制逐轮前置判断。非研发对话不使用 AI Talk；`$ai-talk:...` 仅保留为兼容的显式调用方式。

完整说明见 [USAGE.md](USAGE.md)。`route-company-skills.mjs` 与 `TaskHandoff 1.1` 仅保留为 legacy CLI 兼容层。
