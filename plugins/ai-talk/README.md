# AI Talk Plugin

AI Talk 将研发任务整理为以下结构，并在内部保留真实公司 Skill 路由：

```json
{
  "original_goal": "开发 recharge/components/dialogs 下的礼物连爆弹窗",
  "confirmed_context": [
    { "type": "target_directory", "value": "目标目录：recharge/components/dialogs", "source": "user_text:path" }
  ],
  "intent": "feature_create",
  "entities": {
    "ui_component": [{ "value": "dialog", "label": "弹窗", "source": "user_text" }],
    "target_scope": [{ "value": "recharge/components/dialogs", "label": "recharge/components/dialogs", "source": "user_text:path" }]
  },
  "retrieval_query_groups": {
    "docs": [],
    "skills": ["前端新功能开发与已有能力复用"],
    "components": ["dialog", "modal", "popup"],
    "code": ["recharge/components/dialogs dialog 实现"]
  },
  "retrieval_queries": ["前端新功能开发与已有能力复用", "dialog", "modal", "popup", "recharge/components/dialogs dialog 实现"],
  "retrieval_directions": ["弹窗组件文档", "recharge/components/dialogs 已有实现"],
  "boundaries": ["不补充用户未确认的业务逻辑"],
  "unknowns": ["弹窗触发入口尚未确认；如果当前代码能够确定，则不追问。"],
  "execution_skill": "gen-code"
}
```

默认输出以研发概念和概括性检索方向为主体，不展示内部 Query 数组，只在结尾显示 `执行能力：gen-code`。只有输入同时明确要求两个容易混淆的交付物时才显示一行选型说明。

## 路由

```bash
node skills/ai-talk/scripts/route-company-skills.mjs \
  --root /path/to/project \
  --query '开发 recharge/components/dialogs 下的礼物连爆弹窗' \
  --evidence-type 'visual=弹窗视觉稿' \
  --evidence-type 'interaction=交互流程' \
  --evidence-type 'api=连爆次数接口信息'
```

附件证据必须来自真实附件。普通文本中的“图片、图标、背景图”不会被识别为截图。检索表达可以扩展同义词，但不会成为用户已确认需求；代码符号只有真实出现时才会成为精确查询词。

默认索引项目 `.agents/skills/**/SKILL.md`、显式批准的公司 Skill 根和插件自带 `ui-self-check`。只读取 frontmatter、description 与明确标记的触发条件/适用场景短段；不读取下游 Skill 知识库，不维护组件索引。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/ai-talk/tests -v
node --test skills/ai-talk/tests/*.mjs
```
