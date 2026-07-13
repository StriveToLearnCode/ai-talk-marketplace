# AI Talk Plugin

AI Talk 将自然语言研发需求识别为可执行任务，读取有限项目上下文并自动匹配内部 Skill、项目规则和可复用能力。简单明确任务直接处理；复杂任务通过一张轻量确认卡连接到 Codex 执行。

## 交互流程

```text
理解任务 → 一次轻量上下文与能力索引 → 自动采用明确能力
→ 简单任务：直接交给 Codex
→ 复杂任务：任务确认卡 → 调整或一次点击开始执行
```

任务卡只展示任务类型、执行方式、目标、范围、内部 Skill、可复用能力、关键约束和风险。它不是模板管理器，不包含搜索、分类、模板编辑或导入导出。

## 状态

- `ready`：信息完整，可以开始执行。
- `needs_confirmation`：组件、复用方式、规则或范围存在需要用户选择的歧义。
- `blocked`：缺少一项真正阻塞的信息。

`presentation` 为 `card` 或 `bypass`。只分析/只审查的短任务，或已经给出明确文件范围的单一场景任务，可以使用 `bypass`。

## 统一上下文

```bash
python3 skills/ai-talk/scripts/collect_context.py \
  --root /path/to/project \
  --query '帮我根据截图开发一个独立榜单页面' \
  --related src/pages/rank.vue
```

输出 schema version `5`，其中 `task_context.confirmation` 是任务卡的唯一数据源。能力仍保留 `automatic`、`choice_required` 和兼容的 `selected` 扁平结果。

## MCP App

插件通过 `.mcp.json` 启动本地 stdio server：

- `show_ai_talk_task`：渲染任务确认卡。
- `adjust_ai_talk_task`：只更新执行方式、范围和内部能力用法。
- `ui/message`：仅在用户点击“开始执行”后发送完整任务话术。

当前公开 MCP Apps 协议没有只写入 Codex composer 草稿的接口。因此“插入输入框”在宿主不支持时复制完整话术，明确提示未自动发送；不会用发送消息来伪装插入。

Codex CLI `0.143.0` 中 `enable_mcp_apps` 仍属于开发期开关。无法渲染 MCP App 的宿主会按 Skill 规则降级到紧凑文本确认。

## 能力选择

主 Skill、项目规则、适用 Prompt、唯一项目组件/utility/历史实现进入 `automatic`。共享能力、跨项目能力或同类型多项竞争进入 `choice_required`。

用户只对歧义项选择：

- `prefer_reuse`：优先验证复用。
- `prefer_reference`：仅供参考。
- `excluded`：本次排除。

`execution_validation` 在 AI Talk 准备阶段始终为 `null`，只有开始执行后的 Codex 实际读取代码后才能更新。

## 安全边界

- 准备阶段只运行一次 `collect_context.py`。
- 不扫描 `.env`、密钥、`node_modules` 或构建产物。
- 不在准备阶段读取候选业务源码、分析根因、运行构建或测试。
- 用户点击“开始执行”或命中 `bypass` 后，进入正常 Codex 工作流。
- 不编造 Skill、组件、路径、接口字段或兼容性结论。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/ai-talk/tests -v
node --test skills/ai-talk/tests/*.mjs mcp/tests/*.mjs
python3 /Users/wepie/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
```

人工新线程验收见 `tests/acceptance-cases.md`。
