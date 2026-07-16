# AI Talk Plugin

AI Talk 将用户口语、截图角色和任务动词规范化为公司 Skill 检索画像，并只从真实运行时索引推荐 Skill。它不执行任务、不生成执行 Prompt，也不调用候选 Skill。

## 内部调试画像

```json
{
  "task_action": "modify_code",
  "target_category": "ui_page",
  "desired_output": "frontend_code_changes",
  "execution_mode": "modify_and_verify",
  "evidence_types": ["screenshot"],
  "intent_terms": ["直接实现"],
  "exclusion_terms": ["不改领取逻辑"],
  "unknowns": []
}
```

这些字段及 `expanded_terms` 只用于匹配与调试，不出现在默认用户回复中；扩展词不表示用户已确认这些需求。

## 路由

```bash
node skills/ai-talk/scripts/route-company-skills.mjs \
  --root /path/to/project \
  --query '参考截图直接实现活动页，不改领取逻辑' \
  --evidence-type screenshot
```

默认索引项目 `.agents/skills/**/SKILL.md`、显式批准的公司 Skill 根和插件自带 `ui-self-check`。只读取 frontmatter 的 `name`、`description` 与标题明确标记的触发条件/适用场景短段；排除 `docs/skills` 对照副本，并报告重复 `name` 的全部真实路径。

默认回复约 150 字，只展示 AI 理解、推荐执行、最多 3 条判断依据和 1 个必要的未选择原因。只显示 Skill 名称；画像、绝对路径、候选、索引统计和冲突保留在脚本 JSON 中供调试。

## 边界

- 不维护组件库、Context Builder 或执行编排。
- 不读取候选 Skill 的 references、脚本、知识库或普通正文。
- 不生成代码、配置、测试文件或执行 Prompt。
- 不调用下游 Skill，也不自动打开浏览器、Figma、PageCenter 或其他工具。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/ai-talk/tests -v
node --test skills/ai-talk/tests/*.mjs
```
