# AI Talk

AI Talk 是显式调用的“研发任务上下文增强器”。它保留用户原始目标，提取带来源的真实上下文，把自然语言、路径和附件角色规范化为适合检索公司 Docs、Skill、组件知识库与项目已有实现的查询，并补充必要任务边界和一个可能阻塞执行的问题。

```text
用户原始目标与真实证据
→ confirmed_context（每项带 source）
→ 3～6 个 retrieval_queries
→ boundaries / unknowns
→ 内部 Skill 路由
→ execution_skill
```

默认输出只展示“用户目标、已确认上下文、建议检索、任务边界与未知项”四个区域，结尾显示一行 `执行能力：<真实 Skill 名称>`。Skill 候选、评分、路径和索引详情仅供 `--debug-json` 调试。

AI Talk 可以扩展检索表达，但不会扩展用户业务需求；它不维护公司组件索引、不预设组件名称、不编造文档、接口或路径，也不代替下游 Skill 消费知识库和执行任务。

## 安装

```bash
codex plugin marketplace add StriveToLearnCode/ai-talk-marketplace --ref master
codex plugin add ai-talk@personal
```

本地开发：

```bash
codex plugin marketplace add "$PWD"
codex plugin add ai-talk@personal
```

安装或更新后新建对话，再显式调用：

```text
$ai-talk 开发 recharge/components/dialogs 下的礼物连爆弹窗
```

公开 marketplace 使用 `$ai-talk:ai-talk`。

## 文件职责

- `plugins/ai-talk/skills/ai-talk/SKILL.md`：上下文增强契约与 Skill 路由边界。
- `plugins/ai-talk/skills/ai-talk/scripts/route-company-skills.mjs`：上下文结构生成与真实 Skill 路由。
- `plugins/ai-talk/skills/ai-talk/scripts/format-user-output.mjs`：确定性的默认输出。
- `ai-talk-public-marketplace/`：公开发布副本。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s plugins/ai-talk/skills/ai-talk/tests -v
node --test plugins/ai-talk/skills/ai-talk/tests/*.mjs
```

路由基准会输出 Top 1 命中率、Top 3 召回率、混淆矩阵和错误案例。
