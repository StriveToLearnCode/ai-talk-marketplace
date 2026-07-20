# AI Talk Plugin

AI Talk 是一个 Codex 插件，用于保持开发者原话，并补充公司 Skill、组件、Docs 和仓库检索所需的增量上下文。它不替代公司的 Skill，也不直接负责写代码。

它把研发输入增强为结构化执行协议：

1. 保持用户原话，不生成改写后的任务目标。
2. 最多补充 2 条高价值增量事实，并给出一条 1～2 句的任务专属工程判断。
3. 只为真实命中的代码、组件、Docs 或 Skill 索引选择入口；标准 Bug 在预算内覆盖至少两个不同排查层，最多 3 项。
4. 从原话直接确定 `modify_and_verify`、`inspect_only` 或 `plan_then_execute`；仅在无法判断是否允许修改时询问一次。

```bash
node skills/ai-talk/scripts/route-company-skills.mjs \
  --root /path/to/project \
  --query '帮我开发这个图，3 是目标 UI。' \
  --evidence-json '{"kind":"attachment_reference","attachment":"attachment_3","role":"target","source":"user","status":"fact"}'
```

默认输出是由结构化 `execution_plan` 单向渲染的精简增强结果。前台只允许已补充上下文、AI 判断、公司检索入口、需要确认和下一步；机器调用使用 `--format json`，调试时使用 `--debug-json`。

只有 `plan_then_execute` 在方案完成后需要一次确认：

```bash
node skills/ai-talk/scripts/route-company-skills.mjs \
  --root /path/to/project \
  --query '开始执行' \
  --previous-contract /path/to/previous-contract.json
```

JSON 结果包含 `execution_plan` 1.1；`task.reasoning`、`knowledge_requirements` 和 `retrieval` 驱动 Formatter，截图研发维度仍作为 `source_facts`、`blockers` 和 `verification` 中的 typed entries 保留。明确修改意图首轮即设为 `authorized`，handoff 保留完整计划。

读取范围通过 `realpath` 限制在项目根目录内；拒绝 `node_modules` 和仓库外符号链接。总处理时间目标不超过 45 秒，最多搜索 2 次，单文件最多 128 KiB，上下文正文最多 4 个文件。标准 Bug 至少覆盖两个不同排查层后早停。Skill 默认只读取 name/description 索引。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/ai-talk/tests -v
node --test skills/ai-talk/tests/*.mjs
```
