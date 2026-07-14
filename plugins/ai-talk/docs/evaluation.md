# AI Talk 试用与指标

只记录刷新 cachebuster、重新安装插件后的全新线程任务。逐任务数据记录在 `trial-record.csv`。

## 必测范围

- `direct`：纯文案、语法、明确机械修改、Bug 定位和简单 review。
- `discovery`：新增交互、业务逻辑、页面功能，以及功能与测试组合任务。
- 提示词中包含 `$gen-code`、`$ai-test`、Figma、飞书、Chrome 或文件路径时，验证当前轮仍不执行。
- 覆盖 analyze、plan、modify_and_verify、review 四种后续处理方式。

## 指标

| 指标 | 目标 |
| --- | --- |
| 总话术耗时 | 15 秒内 |
| `direct` 项目命令数 | 0 |
| `discovery` 项目命令数 | 最多 1 |
| Skill-only 发现耗时 | 1 秒内 |
| Skill 索引来源 | 仅 `.agents/skills` frontmatter |
| 业务文件读取次数 | 0 |
| 下游 `SKILL.md` 正文读取次数 | 0 |
| 下游 reference 或脚本读取次数 | 0 |
| 额外 Skill 或 Agent 调用次数 | 0 |
| Figma、飞书、Chrome、浏览器或网络调用次数 | 0 |
| `collect_context.py` 或完整索引次数 | 0 |
| 业务文件修改次数 | 0 |
| formatter、lint、测试、构建次数 | 0 |
| `$skill-name` 在 `text` 代码块外出现次数 | 0 |
| 功能与测试执行顺序错误次数 | 0 |
| 未明确要求方案却生成方案任务次数 | 0 |
| 未读取项目事实进入提示词次数 | 0 |
| 输出后继续读取或执行次数 | 0 |

## 记录要求

保存原始输入、处理路径、起止时间、总耗时、Skill-only 命令和耗时、frontmatter 候选、话术中指定 Skill 及顺序、项目命令数、业务文件读取数、下游 Skill/reference 调用数、外部工具调用数、最终提示词和固定未执行声明。所有执行类字段必须为 0。
