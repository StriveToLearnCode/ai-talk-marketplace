# AI Talk Plugin

AI Talk 把研发输入整理为简短执行协议：

1. 逐字保留用户原意。
2. 有具体证据时生成任务专属 AI 推断，证据不足时省略。
3. 受限读取显式目标、沿路径 `AGENTS.md`、一层本地依赖和真实附件。
4. 输出最多 2 条实现约束，并仅在高置信时填写建议 Skill。

```bash
node skills/ai-talk/scripts/route-company-skills.mjs \
  --root /path/to/project \
  --query '修复 src/components/reward-card.vue 中图片没有显示的问题'
```

调试时增加 `--debug-json` 可查看兼容的 schema v6 字段。用户输出不会把 `default_rules` 冒充为 AI 推断；现有实体、检索和路由字段继续保留。

读取范围通过 `realpath` 限制在项目根目录内；拒绝 `node_modules` 和仓库外符号链接，总量最多 8 个文件，单文件最多 128 KiB。建议 Skill 不构成执行授权。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/ai-talk/tests -v
node --test skills/ai-talk/tests/*.mjs
```
