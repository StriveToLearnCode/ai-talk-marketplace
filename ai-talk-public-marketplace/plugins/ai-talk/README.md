# AI Talk Plugin

AI Talk 是一个 Codex 插件，用于将开发者的自然语言、截图、设计稿、接口信息和项目资料，整理成下一步 AI 可直接执行的 Task Handoff。它不替代公司的 Skill，也不直接负责写代码。

它把研发输入整理为结构化执行协议：

1. 将用户输入整理为一句任务目标和一句任务专属工程判断。
2. 识别完成任务必须检索的知识对象，不用泛化分类凑数。
3. 只为有真实引用、UI 结构、同类使用、文档/Skill 索引或用户指定证据的知识对象选择入口。
4. 固定输出任务目标、AI 判断、优先检索、硬阻塞和下一 Skill；详细事实只保留在 JSON 协议中。

```bash
node skills/ai-talk/scripts/route-company-skills.mjs \
  --root /path/to/project \
  --query '帮我开发这个图，3 是目标 UI。' \
  --evidence-json '{"kind":"attachment_reference","attachment":"attachment_3","role":"target","source":"user","status":"fact"}'
```

默认输出是由结构化 `execution_plan` 单向渲染的精简 Task Handoff。`待确认` 仅在真正阻塞时出现；截图描述、目录、依赖、Docs、AGENTS、约束和验收不在文本中展开。机器调用使用 `--format json`；调试时使用 `--debug-json`。

后续独立授权轮由同一 CLI 执行真实门禁：

```bash
node skills/ai-talk/scripts/route-company-skills.mjs \
  --root /path/to/project \
  --query '开始执行' \
  --previous-contract /path/to/previous-contract.json
```

JSON 结果包含 `execution_plan` 1.1；`task.reasoning`、`knowledge_requirements` 和 `retrieval` 驱动 Formatter，截图研发维度仍作为 `source_facts`、`blockers` 和 `verification` 中的 typed entries 保留。授权门禁优先消费 `route.skill`，handoff 保留完整计划。

读取范围通过 `realpath` 限制在项目根目录内；拒绝 `node_modules` 和仓库外符号链接。单文件最多 128 KiB，上下文正文默认最多 5 个文件，同类实现正文最多 1 个。多图 UI 没有明确目标文件时不做全仓兜底；确认目标图、目标文件和 2～3 个可靠入口后早停。Skill 只读取 name/description 索引，不读取正文；不读取 Docs。建议 Skill 不构成执行授权。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/ai-talk/tests -v
node --test skills/ai-talk/tests/*.mjs
```
