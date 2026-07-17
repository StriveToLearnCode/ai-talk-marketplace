# AI Talk 验收场景

## A. 原意与 AI 推断

`$ai-talk 在 banner-spin.vue 中，积分阶段 PROGRESS_TASK_ID: 7，然后一样展示进度和奖励`

- 用户原意只移除 `$ai-talk` 标记，其余文本逐字保留。
- 当前证据不足以形成新的工程判断时，省略 AI 推断。
- 不用通用规则填充 AI 推断。

## B. 任务专属推断与实现约束

`$ai-talk 开发一个弹窗`

- 推断为新增 UI 需求，优先查找项目已有弹窗实现。
- 不预设 props、事件、按钮或业务逻辑。
- 通用规则进入最多 2 条实现约束，不得作为 AI 推断。
- 输入“不要复用现有实现，可以全局重构”时，删除冲突的复用和范围限制规则。

## C. 显式项目上下文

`$ai-talk 修复 src/feature/target.ts 中的显示问题`

- 读取并列出目标文件、从项目根到目标路径生效的 `AGENTS.md` 和目标文件的一层相对依赖。
- 不读取无关兄弟文件，不递归目标目录，不读取 `node_modules`。
- 项目规则使用 `[项目]` 来源，并带真实 evidence。

## D. 读取边界

- 仓库外符号链接不得被读取，原因进入 Handoff 待确认。
- 文件超过 128 KiB 时不得读取内容，原因进入 Handoff 待确认。
- 总读取文件数不得超过 8 个。
- 缺失或不可读目标不得触发全仓搜索。

## E. 附件、资源与接口

`$ai-talk 奖励领取后增加 icon/mask 蒙层`

- `icon/mask` 进入项目上下文的资源项，不识别为目录。
- 视觉稿、交互图和截图只显示已提供及附件来源，不复述 OCR。
- 接口资料保留 `state=0` 等真实字段，不猜业务含义。

## F. 建议 Skill

- 高置信时输出建议 Skill；低置信时省略整个建议 Skill 模块。
- 内部 Handoff 字段保持 schema v6 兼容，但不在简短用户输出中展开。
- 建议 Skill 不触发自动执行，后续仍需独立一轮明确授权。

## G. schema v6 与兼容

- 调试结果包含 `execution_goal`、`default_rules`、`project_context` 和 `skill_handoff`。
- `default_rules` 每项包含 `value`、`source` 和可选 `evidence`，总数不超过 5。
- 保留 `confirmed_context`、`intent`、`entities`、检索、边界、unknown 和路由字段。
- 中文输出不暴露评分、候选、canonical ontology、内部 Query 或分析过程。

## H. 五个精确推断用例

- 奖励领取后增加 `icon/mask` 蒙层：判断为已有奖励节点的领取态视觉扩展，优先确认状态判断与资源引用，不猜状态字段。
- 第三个奖励没显示：判断为单节点异常，优先确认数据、状态和渲染条件，不推断 `rewardList[2]`。
- `state=0` 但页面显示已领取：识别状态映射冲突，不判断 `state=0` 的业务含义。
- 开发一个弹窗：判断为新增 UI，优先查找已有弹窗实现，不补充按钮、props 或事件。
- 明确文件修改一句文案：省略 AI 推断。
