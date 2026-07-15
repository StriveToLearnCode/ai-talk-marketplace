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

每次评估记录原始输入、八字段画像、Top 1、Top 3、真实路径、冲突、阻塞项、混淆矩阵和错误案例。扩展词单独记录，不计作用户已确认需求。
