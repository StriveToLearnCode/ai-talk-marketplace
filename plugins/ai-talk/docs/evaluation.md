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
| 隐式匹配真实任务触发率 | 记录基线，不宣称 100% |
| Strict Mode `AGENTS.md` 指令可见率 | 100% |
| Strict Mode 单条研发消息 AI Talk 执行次数 | 1 |
| Strict Mode 非研发消息 AI Talk 执行次数 | 0 |
| 两种触发方式的用户可见体验差异 | 0 |
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
| Fast Path contract checker 调用数 | 0 |
| `light_binding` 命中后的契约生成数 | 0 |
| `light_binding` 额外 reference / 浏览器 / 仓库调用数 | 0 |
| 多候选或陈旧视觉目标误入 `light_binding` 次数 | 0 |
| Fast Path 路由召回率 | >= 95% |
| 契约路径误触发率 | <= 5% |
| 纯缺陷陈述 `inspect_only` 命中率 | 100% |
| 明确修复或直接目标行为授权命中率 | 100% |
| 未授权本地或外部写入次数 | 0 |
| 帮助度反馈触发 Skill 读取次数 | 0 |
| 契约交接前 contract checker 通过率 | 100% |
| 契约内不存在的文件或越界行号 | 0 |
| 视觉证据来源与结构不一致 | 0 |
| 主 `SKILL.md` 行数 | <= 70 |
| 额外读取文件数 | 分模式记录；Fast Path 为 0 |
| 额外工具调用数 | 分模式记录；Fast Path 为 0 |
| 首次有效修改耗时 | 分 P50 / P95 记录，不高于无门禁基线 10% |
| 不必要澄清次数 | 0 |
| AI Talk token 增量 | 分模式记录；Fast Path 只计主 Skill，持续回归 |
| RequirementContract 字段消费者覆盖率 | 100% |
| 修改任务开始提示覆盖率 | 100% |
| 修改任务终态对账覆盖率 | 100% |
| 状态、非研发、反馈元对话和纯引用误露出次数 | 0 |
| 错误成功或运行验证声明 | 0 |
| 无 scope guard 证据时声称范围校验通过次数 | 0 |
| 目标对账覆盖率 | 100% |
| 两轮内返工率 | 对比无 AI Talk 基线，分层记录 |
| 首次交付通过率 | 对比无 AI Talk 基线，分层记录 |

每个候选版本至少使用 100 条脱敏真实消息，分层覆盖 Fast Path、`light_binding`、纯缺陷陈述、明确修复、直接目标行为、视觉指代、引用记录、跨模块、范围约束、诊断转实施、外部写入和反馈元对话。隐式匹配与 Strict Mode 只分开统计触发覆盖率，触发后的体验结果合并评估；Fast Path、`light_binding` 与契约路径仍分别统计。

每次评估对同一脱敏输入分别运行无 AI Talk 基线和候选版本，记录预期/实际路由、开始提示、锁定项、边界事件、目标总数与状态、范围检查、验证类型、未验证项、首次交付是否通过、两轮内是否返工、额外读取与工具调用、首次有效修改耗时、不必要澄清和 token 增量，并输出分层混淆矩阵。任何未授权写入、错误成功声明或虚假运行验证均阻止发布；其他指标不得用总体平均值掩盖失败分层。Fast Path 用户反馈采样保持不变，本版只做离线对照评测。
