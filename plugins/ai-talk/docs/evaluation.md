# AI Talk 路由评估

必测相近边界：`ui-self-check` vs `ai-test`、`gen-code` vs `gen-frontend-plan`、`figma-analyze` vs UI 开发、PageCenter 配置 vs 普通开发、自定义活动积木 vs 普通组件。

| 指标 | 目标 |
| --- | --- |
| 明确任务 Top 1 命中率 | >= 90% |
| 模糊任务 Top 3 包含正确 Skill | >= 90% |
| Skill 名称和路径来自真实索引 | 100% |
| 重复 `name` 冲突报告 | 100% |
| 画像字段 | 固定 8 个 |
| 索引来源 | 运行时 Skill 根；排除 `docs/skills` 对照副本 |
| 索引内容 | frontmatter、description、明确触发条件/适用场景短段 |
| references、知识库、组件源码读取次数 | 0 |
| “测一下”误选 `ai-test` | 0 |
| 阻塞问题数量 | 最多 1 |
| 下游 Skill 或外部工具调用次数 | 0 |
| 默认模式真实任务隐式触发率 | 记录基线，不宣称 100% |
| 严格模式 `AGENTS.md` 指令可见率 | 100% |
| 严格模式单条研发消息 AI Talk 执行次数 | 1 |
| 严格模式非研发消息 AI Talk 执行次数 | 0 |
| 非终态帮助度询问次数 | 0 |
| 单任务终态帮助度询问次数 | 最多 1 |
| 反馈生成 RequirementContract 次数 | 0 |
| 未同意的远端反馈发送次数 | 0 |
| 反馈中源码、命令、工具输出或完整对话泄露 | 0 |
| 未配置反馈端点时的主动询问次数 | 0 |
| `completed` 反馈询问率 | 默认约 20% |
| 并发 flush 丢失反馈数 | 0 |
| 未显式安装项目 Hook 时声称 Hook 生效次数 | 0 |
| 缺少 `ai_talk_task_id` 的工具错误归因次数 | 0 |
| Fast Path RequirementContract 生成数 | 0 |
| Fast Path reference 读取数 | 0 |
| Fast Path AI Talk 仓库读取数 | 0 |
| Fast Path `next_skill` 选择数 | 0 |
| Fast Path reporter 调用数 | 0 |
| 主 `SKILL.md` 行数 | <= 70 |
| 额外读取文件数 | 分模式记录；Fast Path 为 0 |
| 额外工具调用数 | 分模式记录；Fast Path 为 0 |
| 首次有效修改耗时 | 分 P50 / P95 记录，不高于无门禁基线 10% |
| 不必要澄清次数 | 0 |
| AI Talk token 增量 | 分模式记录；Fast Path 只计主 Skill，持续回归 |

默认模式和严格模式必须分开统计，Fast Path 与契约路径也必须分开统计。每次评估记录原始输入、触发模式、路由类型、是否加载契约、额外读取文件数、额外工具调用数、首次有效修改耗时、不必要澄清次数和 token 增量。legacy CLI 继续记录八字段画像、Top 1、Top 3、真实路径、冲突、阻塞项、混淆矩阵和错误案例。反馈评估只使用脱敏 `FeedbackEnvelope 1.0`，不得复用完整原始输入。
