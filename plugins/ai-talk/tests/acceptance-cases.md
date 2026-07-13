# AI Talk 任务确认 UI 验收

每个用例在刷新 cachebuster、重新安装插件后的全新 Codex 对话中运行。AI Talk 准备阶段只允许一次 `collect_context.py` 轻量索引，不得额外读取候选业务源码、定位根因、运行测试或修改业务文件。

## 1. 简单任务直达

输入一个单一场景、短且明确的只分析任务。

通过条件：`confirmation.state == ready`、`presentation == bypass`；不展示确认卡、不要求输入“继续”，直接进入正常 Codex 流程。

## 2. 完整任务确认卡

输入：

```text
$ai-talk 帮我根据截图开发一个独立榜单页面。
```

通过条件：识别 `ui_reconstruction + feature_development`；卡片一屏内展示任务类型、执行方式、目标、范围、内部 Skill、可复用能力、约束和风险；状态为 `ready` 或 `needs_confirmation`。

## 3. 自动能力

前置条件：只有一个高相关项目组件。

通过条件：组件自动标记 `prefer_reuse`，`execution_validation == null`；不单独要求用户确认该组件。

## 4. 歧义能力

前置条件：多个组件竞争同一职责，或只有共享/跨项目能力。

通过条件：进入 `needs_confirmation`；调整区域只允许 `prefer_reuse / prefer_reference / excluded`；选择完成后回到 `ready`。

## 5. 三个按钮

- “调整”只修改执行方式、范围和内部能力用法。
- “插入输入框”不自动发送；当前宿主无 composer API 时复制完整话术并提示降级。
- “开始执行”只在 `ready` 时突出并启用；一次点击发送完整话术，不再要求“继续”。

## 6. 规则和范围风险

输入涉及公共组件、范围扩大，或与 `AGENTS.md` 的复用规则冲突。

通过条件：风险清晰但不过度醒目；规则冲突进入 `needs_confirmation`，不静默选择。

## 7. 阻塞问题

输入缺少唯一真正影响执行方向的信息。

通过条件：状态为 `blocked`；卡片只询问一个 `blocking_question`；“开始执行”禁用。

## 8. MCP Apps 降级

在不支持 MCP Apps 或未启用 `enable_mcp_apps` 的宿主中运行。

通过条件：输出紧凑文本确认；不虚构卡片按钮；仍遵守一次点击/明确文本选择后才发送复杂任务。
