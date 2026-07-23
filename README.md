# AI Talk

AI Talk 自动匹配研发请求，并把它们编译为紧凑的 `RequirementContract 1.2`。默认模式无需命令前缀，但是否触发由 Codex 的 Skill 匹配决定；需要每条研发消息都先经过 AI Talk 时，可为目标仓库安装 Strict Mode。状态询问和确认原样放行，只有会改变产品结果或写范围的硬阻塞才暂不放行并追问。

```text
默认自动匹配 / 仓库严格模式
→ AI Talk 前置判断（每条消息最多一次）
→ 状态询问 / 确认：原样放行
→ 明确研发任务：skip / handoff 后放行
→ 硬阻塞：clarify，暂不放行
```

AI Talk 只询问会改变产品结果、数据语义或允许写入范围的硬问题。明确的目标行为本身就是修改意图，不需要再次询问授权；用户要求“为什么”“只分析”时保持 `inspect_only`，随后说“执行”则复用原契约转入实施。

AI Talk 路由的任务到达终态后先检查反馈资格：异常终态在已同意的反馈通道中全量询问，成功终态默认采样 20%，没有端点时默认不打扰。反馈经过字段白名单与敏感信息脱敏后使用本地 spool 暂存；只有配置 HTTPS 上报端点并设置 `AI_TALK_FEEDBACK_CONSENT=1` 时才会远端发送。默认项目 Hook 只负责终态补问；工具错误只有宿主附带 `ai_talk_task_id` 时才允许归因，不采集命令、源码或工具输出。

## 视觉目标

“这里”“这两部分”“第二个头像”等指代会绑定为稳定 `target_refs`：

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
