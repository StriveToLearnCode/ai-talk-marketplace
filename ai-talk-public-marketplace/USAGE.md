# AI Talk 安装与使用说明

主 Skill `$ai-talk:ai-talk` 负责意图归一化与真实 Skill 路由，不执行开发任务。独立 `$ai-talk:ui-self-check` 保留，但主 Skill 不会自动编排它。

## 使用

```text
$ai-talk:ai-talk <研发任务>
```

画像固定包含：`task_action`、`target_category`、`desired_output`、`execution_mode`、`evidence_types`、`intent_terms`、`exclusion_terms`、`unknowns`。

同义扩展词只用于检索召回，并单独标记为 `expanded_terms`。AI Talk 不会将扩展词写成用户已确认需求。

AI Talk 只读取项目 `.agents/skills/**/SKILL.md`、显式批准公司根和插件自带 `ui-self-check` 中真实 `SKILL.md` 的 frontmatter、description 与明确触发条件/适用场景短段。匹配名称与路径必须来自该索引；`docs/skills` 对照副本不会参与运行。

默认输出原始目标、画像摘要、Top 1、最多 2 个备选、推荐依据和相近 Skill 排除原因。重复 `name` 会报告全部冲突路径；只有真正影响路由时才输出一个待确认项。

AI Talk 不读取候选 Skill 知识库，不生成执行 Prompt、代码、配置或测试，不调用候选 Skill，也不提供执行步骤或自定义 UI。

## 更新

```bash
git pull
codex plugin add ai-talk@ai-talk-marketplace
```

更新后新建 Codex 对话。
