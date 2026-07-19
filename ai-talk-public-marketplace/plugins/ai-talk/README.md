# AI Talk Plugin

AI Talk 把研发输入整理为简短执行协议：

1. 原样保留用户真正要完成的目标和明确限制。
2. 判断动作、关注对象和目标产物，不猜未经验证的根因。
3. 受限读取显式目标、沿路径 `AGENTS.md`、一层本地依赖和真实附件。
4. 输出可直接交接的执行要求、限制和未确认项，并只推荐职责匹配且已安装的 Skill。

```bash
node skills/ai-talk/scripts/route-company-skills.mjs \
  --root /path/to/project \
  --query '修复 src/components/reward-card.vue 中图片没有显示的问题'
```

默认输出是不含评分噪音、可直接交给后续 Codex 的文本执行提示。机器调用使用 `--format json`；调试时使用 `--debug-json`，它会输出 JSON 并增加候选评分、索引和上下文读取信息。

JSON 结果字段为 `original_request`、`intent`、`evidence`、`recommended_skill`、`alternative_skills`、`selection_reason`、`boundaries`、`unknowns` 和 `execution_prompt`。目标 Skill 不存在时不会改选其他职责的 Skill，输出会说明缺失项以及安装、启用或通过 `--source-root` 提供 Skill 的下一步。

读取范围通过 `realpath` 限制在项目根目录内；拒绝 `node_modules` 和仓库外符号链接，直接依赖总计最多 2 个，单文件最多 128 KiB。建议 Skill 不构成执行授权。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/ai-talk/tests -v
node --test skills/ai-talk/tests/*.mjs
```
