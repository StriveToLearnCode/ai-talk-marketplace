# AI Talk Plugin

AI Talk 把研发输入整理为简短执行协议：

1. 将用户输入整理为一句任务目标和一句任务专属工程判断。
2. 先识别完成任务必须理解的知识，最多 4 类，不用泛化分类凑数。
3. 从真实项目上下文或 Skill 索引为每类知识选择最佳入口，并说明检索用途。
4. 输出最多 5 个入口、2 条边界、当前阶段、执行模式和职责匹配且已安装的 Skill。

```bash
node skills/ai-talk/scripts/route-company-skills.mjs \
  --root /path/to/project \
  --query '修复 src/components/reward-card.vue 中图片没有显示的问题'
```

默认输出是不含评分噪音、可直接交给后续 Codex 的文本执行提示，包含原始请求、已确认信息、未确认项和 Skill 选择依据。机器调用使用 `--format json`；调试时使用 `--debug-json`，它会输出 JSON 并增加候选评分、索引和上下文读取信息。

后续独立授权轮由同一 CLI 执行真实门禁：

```bash
node skills/ai-talk/scripts/route-company-skills.mjs \
  --root /path/to/project \
  --query '开始执行' \
  --previous-contract /path/to/previous-contract.json
```

JSON 结果增加 `task_goal`、`engineering_judgment`、`required_knowledge`、`retrieval_entries`、`stage` 和 `execution_mode`，并保留原有路由、证据和兼容字段。目标 Skill 不存在时不会改选其他职责的 Skill。

读取范围通过 `realpath` 限制在项目根目录内；拒绝 `node_modules` 和仓库外符号链接，单文件最多 128 KiB，源码索引另受文件数和总字节数限制。`AGENTS.md` 与普通依赖只用于内部判断，不直接展示。建议 Skill 不构成执行授权。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/ai-talk/tests -v
node --test skills/ai-talk/tests/*.mjs
```
