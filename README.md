# AI Talk

AI Talk 是显式调用的 `Intent Normalizer + Skill Query Router`。它在内部保留八字段检索画像用于匹配，再用简短自然语言向开发者说明任务理解和推荐结果。

```text
用户原话与明确证据
→ task_action / target_category / desired_output / execution_mode
→ evidence_types / intent_terms / exclusion_terms / unknowns
→ 读取运行时 SKILL.md 的 frontmatter、description 与明确触发条件/适用场景
→ 内部保留完整路由与调试数据
→ 默认只显示 AI 理解、推荐执行、最多 3 条依据和 1 个必要排除项
```

默认回复约 150 字，只显示 Skill 名称，不显示画像字段、绝对路径、索引冲突或重复 name。AI Talk 不维护组件知识库或组件映射，不读取下游 Skill references，不生成执行 Prompt、代码或配置，也不自动调用 Skill。

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
$ai-talk 新增奖励确认弹窗，不改领取逻辑
```

公开 marketplace 使用 `$ai-talk:ai-talk`。

## 文件职责

- `plugins/ai-talk/skills/ai-talk/`：主 Skill、通用路由器与测试。
- `plugins/ai-talk/skills/ui-self-check/`：参与只读索引的即时 UI 检查 Skill；主流程不会调用它。
- `plugins/ai-talk/docs/skills/`：公司 Skill 设计样本，不作为运行时索引或兜底结果。
- `ai-talk-public-marketplace/`：公开发布副本。

旧 Prompt references、默认偏好和 `collect_context.py` 已删除。

## 验证

```bash
 PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s plugins/ai-talk/skills/ai-talk/tests -v
node --test plugins/ai-talk/skills/ai-talk/tests/*.mjs
```

基准测试会输出 Top 1 命中率、Top 3 召回率、混淆矩阵和错误案例。

人工验收见 [acceptance-cases.md](plugins/ai-talk/tests/acceptance-cases.md)。
