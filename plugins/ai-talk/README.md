# AI Talk Plugin

AI Talk 将用户口语、截图角色和任务动词规范化为公司 Skill 检索画像，并只从真实运行时索引决定 Skill。它解释决策和下一步执行准备，但不执行任务，也不调用候选 Skill。

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

这些字段及 `expanded_terms` 只用于匹配与显式 `--debug-json` 调试，不出现在默认用户回复中；扩展词不表示用户已确认这些需求。

## 路由

```bash
node skills/ai-talk/scripts/route-company-skills.mjs \
  --root /path/to/project \
  --query '参考截图直接实现活动页，不改领取逻辑' \
  --evidence-type screenshot
```

默认索引项目 `.agents/skills/**/SKILL.md`、显式批准的公司 Skill 根和插件自带 `ui-self-check`。只读取 frontmatter 的 `name`、`description` 与标题明确标记的触发条件/适用场景短段；排除 `docs/skills` 对照副本，并报告重复 `name` 的全部真实路径。

默认入口经独立 formatter 输出用户文本，固定为“AI 理解 / AI 已决定 / AI 将执行”三层，原因和执行准备各不超过 4 条。只显示 Skill 名称；画像、绝对路径、评分、候选、索引统计和冲突仅在显式 `--debug-json` 调试结果中存在。

截图证据只来自真实图片附件、显式 `--evidence-type screenshot`，或“见截图、参考截图、截图如下、根据这张图”等明确表述。普通的图片、图标和背景图对象词不构成截图证据。

旧 `--profile-json` 路由协议已禁用。

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
