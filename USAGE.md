# AI Talk 使用说明

## 调用

```text
$ai-talk <研发任务>
```

<<<<<<< HEAD
AI Talk 支持 `feature_create`、`bug_fix`、`ui_modify`、`ui_inspection` 和 `planning`。它从用户原话、真实附件和编辑器已提供的上下文中提取事实，只标注真正影响实现方向的缺口。

阻塞缺口最多一个，需要用户确认；非阻塞缺口不打断工作流，由后续 Codex 在执行阶段自行验证。没有真实缺口时，Task Contract 会省略“上下文缺口”区域。

AI Talk 不搜索项目、不读取公司 Docs、不调用 Skill，也不输出检索计划。后续 Codex 根据 Task Contract 自行检索和实施。
=======
AI Talk 生成 Execution Protocol 后停止。它不会自动调用 Next Skill，也不会读取或修改项目文件。

## 示例

输入：
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)

```text
$ai-talk 在 banner-spin.vue 中，积分阶段 PROGRESS_TASK_ID: 7，然后一样展示进度和奖励
```

输出：

```text
Goal
新增积分阶段，关联任务 7，复用已有方式展示进度与奖励。

Context
File
banner-spin.vue
Config
PROGRESS_TASK_ID=7
Business
积分阶段
Business
进度与奖励展示

Need Knowledge
确认任务 7 的数据来源
确认进度与奖励的渲染链路
确认是否已有积分阶段实现
确认进度与奖励的状态映射

Assumptions
任务 7 的对应关系以当前代码为准

Constraints
优先复用已有实现
保持其它阶段行为一致
不要新增数据结构
不要修改无关模块

Next Skill
gen-code
```

## 字段边界

- Goal：规范化后的最终结果，不复述用户原话。
- Context：只放 File、Component、API、Config、Resource、Business、Variable、Code Symbol 等已确认事实。
- Need Knowledge：描述下游 Skill 必须补齐的知识，不是检索关键词。
- Assumptions：只放确实影响实现方向的未知，通常省略。
- Constraints：只放真实实现边界。
- Next Skill：仅在运行时索引高置信命中时输出。

真实附件按视觉、交互、接口或截图角色传给路由脚本。截图只贡献可确认的研发事实，不复述 OCR 内容。

AI Talk 的内部 Query Group 仍分为 Docs、Skills、Components 和 Code；这些数据只用于检索，不进入协议。
