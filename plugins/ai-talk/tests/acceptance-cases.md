# AI Talk 公司 Skill 路由验收

## A. 即时 UI 检查 vs 自动化测试

`$ai-talk:ai-talk 这个活动页面测一下，看看布局和按钮。`

Top 1 必须是 `ui-self-check`，不得因“测一下”选择 `ai-test`。只有明确要求生成/维护 Midscene 测试文件、用例或报告时，Top 1 才是 `ai-test`。

## B. 前端计划 vs 代码开发

`$ai-talk:ai-talk 读取原型并输出 docs/plan 前端实施计划，不修改代码。`

Top 1 必须是 `gen-frontend-plan`。明确要求实际实现页面、组件或业务逻辑时，Top 1 必须是 `gen-code`。

## C. Figma 证据 vs 独立分析

`$ai-talk:ai-talk 参考 Figma 直接做页面，不要单独输出分析文档。`

Top 1 必须是 `gen-code`。只有期望产物是原型分析或交互 Markdown 文档时，才选择 `figma-analyze`。

## D. 专用配置与积木边界

- 只有期望产物是 `page-center-config.json` 或配置推送结果时选择 `gen-page-center-config`。
- 只有目标是活动积木、uiMeta 可配置玩法块时选择 `custom-components-skill`。
- 普通页面开发和普通 Vue 组件都选择真实索引中的 `gen-code`。

## E. 真实索引

Skill 名称和路径必须来自实际索引文件。重复 `name` 时报告全部冲突路径；`plugins/ai-talk/docs/skills/` 对照副本不得成为候选或兜底结果。

## F. 检索画像与输出

画像固定包含 `task_action`、`target_category`、`desired_output`、`execution_mode`、`evidence_types`、`intent_terms`、`exclusion_terms`、`unknowns`。扩展词单独标注，不作为用户确认需求。

默认回复只输出“AI 理解、AI 已决定、AI 将执行”三层；理解必须是一句话，原因和执行准备各最多 4 条。必要的排除理由必须写成“为什么不用 <Skill>？”，不得输出“未选择”字段。只显示 Skill 名称，不显示画像字段、绝对路径、评分、候选、匹配词、索引或冲突详情；不得生成长执行 Prompt、`<details>`、详细实施方案或自动调用下游 Skill。尚未读取的上下文不得声称“已准备”。

自动化基准至少包含 20 条相近用例，并输出明确任务 Top 1 命中率、模糊任务 Top 3 召回率、混淆矩阵和错误案例。
