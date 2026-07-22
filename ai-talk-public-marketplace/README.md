# AI Talk

AI Talk 是研发对话的前置门禁。非研发对话不会触发；一旦进入研发上下文，每条用户消息都会先经过 AI Talk。状态询问和确认原样放行，明确研发任务编译为紧凑的 `RequirementContract 1.2` 后放行，只有会改变产品结果或写范围的硬阻塞才暂不放行并追问。

```text
研发对话中的每条用户消息
→ AI Talk 前置判断
→ 状态询问 / 确认：原样放行
→ 明确研发任务：skip / handoff 后放行
→ 硬阻塞：clarify，暂不放行
```

AI Talk 只询问会改变产品结果、数据语义或允许写入范围的硬问题。明确的目标行为本身就是修改意图，不需要再次询问授权；用户要求“为什么”“只分析”时保持 `inspect_only`，随后说“执行”则复用原契约转入实施。

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

```text
这两处标注的用户头像都加上 pag/user 溜光
```

安装后用户在研发对话中只需正常说话，AI Talk 会自动先判断一次。非研发对话不使用 AI Talk；`$ai-talk:...` 仅保留为兼容的显式调用方式。

完整说明见 [USAGE.md](USAGE.md)。`route-company-skills.mjs` 与 `TaskHandoff 1.1` 仅保留为 legacy CLI 兼容层。
