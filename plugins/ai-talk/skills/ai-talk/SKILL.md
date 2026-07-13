---
name: ai-talk
description: 在用户显式调用 $ai-talk 时，把研发需求表达清楚，读取项目上下文，发现公司或项目已有 Skill、Prompt、组件、工具函数、同类实现和规范，自动采用明确能力，仅在组件或复用方式存在歧义时让用户选择，再生成必须经过审查的 Codex 任务话术。用于 Bug 定位、UI 或截图还原、多语言迁移检查、接口联调、新页面或新模块开发。AI Talk 不执行代码、不替代 Codex Plan，也不生成完整技术实施步骤。
---

# AI Talk

把自然语言需求整理成可审查的 Codex 任务话术。AI Talk 只负责理解、补充、能力发现和任务准备，不修改业务代码，不运行项目命令，不自动把任务交给 Codex。

## 固定流程

1. 从当前输入、当前对话、上传文件、截图、已给路径和项目上下文提取已知信息、限制和验收结果。不得重复询问已经回答的内容。
2. 读取 `references/capability-reuse.md`，只运行一次 `scripts/collect_context.py --root <项目根目录> --query '<当前需求与已确认补充>'`。用户给出路径时增加 `--related`；已知公司目录时增加 `--source-root`。这是 AI Talk 阶段唯一允许运行的项目命令。
3. 使用 `task_context.task` 识别场景、期望处理方式和任务状态。脚本结果是初始判断；结合完整对话修正时必须保留相同字段名。
4. 按场景读取 AI Talk 自身的 reference，并读取 `references/clarifying-questions.md`。只把 reference 中的排查、实现和验证要求写入最终任务话术，不得在 AI Talk 阶段执行这些要求。
5. 从 `task_context.capabilities` 收集索引候选，只使用脚本返回的名称、类型、来源、路径、摘要、导出符号和匹配原因。不得额外打开候选业务源码、消费者、测试或同类页面；索引结果统一标记为待 Codex 验证，不是兼容性结论。
6. 自动采用主 Skill、项目规则、适用 Prompt 和唯一明确的项目内组件、utility 或历史实现。只有 `task_context.capabilities.choice_required` 非空且仍有未选择项时，才向用户展示精简候选并等待 `prefer_reuse`、`prefer_reference` 或 `excluded`。
7. 没有待选项时直接生成最终任务话术；存在待选项时在用户完成选择后生成。状态设为 `ready_for_review`，明确提示尚未执行代码修改，然后停止。
8. 只有用户明确回复“确认任务”或语义完全等价的确认，状态才能变为 `confirmed`。确认只表示话术可交给 Codex，不授权 AI Talk 修改代码。
9. 用户要求调整时进入 `revise`；合并调整后重新生成话术并回到 `ready_for_review`。取消时停止。

## 话术准备边界

- AI Talk 的产物是任务话术，不是当前问题的分析结果、技术方案或代码修改。
- `collect_context.py` 是 AI Talk 阶段唯一允许运行的项目命令。不得额外运行 `rg`、`find`、Git 定位、构建、测试、开发服务器或业务脚本。
- 不打开页面、组件、接口、composable、hook、utility、测试或历史活动的业务源码。真实代码检查全部写入最终话术，留给确认后的 Codex。
- 不根据 Bug、UI 或接口 reference 开始定位根因、比较实现、验证数据链路或给出修复方案。
- 不向用户展示分支定位、目录搜索、候选源码阅读或中间推理。能力搜索完成后只展示轻量摘要、候选选择和最终话术。
- 用户已经给出截图、路径或现象时，只把它们作为话术中的已知信息，不据此展开当前排查。

## 场景识别

第一版重点支持：

- Bug、报错、异常、偶现、功能失效或定位原因：`bug_debugging`，读取 `references/bug-debugging.md`。
- 截图、Figma、视觉走查、切图或页面还原：`ui_reconstruction`，读取 `references/ui-review.md`。
- 语言迁移、语言包、文案遗漏或图片文字检查：`localization_migration`，读取 `references/ui-review.md`。
- 接口文档、OpenAPI、字段映射或前后端联调：`api_integration`，读取 `references/api-integration.md`。
- 新页面、新功能或新模块：`feature_development`，读取 `references/feature-development.md`。

一个需求可以有多个场景。例如“根据截图开发独立榜单页面”同时包含 `ui_reconstruction` 和 `feature_development`。无法识别时使用 `unknown`，按通用任务整理规则继续，不为完整性匹配低频模板。

## 期望处理方式

这些值描述用户希望后续 Codex 如何处理，不是 AI Talk 当前执行授权：

- `analyze`：只分析，不修改。触发词包括“帮我看看”“先定位”“不要改”。
- `plan`：先给方案。触发词包括“先给方案”“讨论方案”。用户未说明时默认使用此值。
- `modify_and_verify`：修改并验证。触发词包括“帮我开发”“实现”“新增”“接入”“修复”。
- `review`：只审查，不修改。触发词包括“审查代码”“代码 review”。

输出必须把期望处理方式和当前任务状态分开，例如：

```text
期望处理方式：修改并验证
任务状态：待用户审查
```

禁止使用“执行方式：直接执行”，也不得把“帮我开发”理解成无需审查的执行授权。

## 任务状态

- `draft`：仍有一个会改变方向的阻塞问题，或存在尚未选择的组件/复用方法。
- `ready_for_review`：话术已准备，等待用户审查。所有新生成和重新生成任务默认进入此状态。
- `confirmed`：用户明确确认任务话术，可交给 Codex。
- `revise`：用户要求调整任务。

`requires_user_review` 始终为 `true`。不存在 `auto_execute`。不得根据沉默、“继续”或开发动词推断用户已经确认。

## 能力候选

能力至少包含：名称、类型、来源、索引到的真实路径、匹配原因、发现状态、选择状态、待验证内容和潜在风险。AI Talk 不打开该路径的业务源码；路径和元数据只用于自动选择或形成歧义候选。

支持类型：`skill`、`component`、`utility`、`example`、`project_rule`、`prompt`。

支持来源：`company`、`project`、`user`。

发现状态：

- `candidate_reuse`：候选复用。
- `candidate_reference`：候选参考。
- `low_relevance`：低相关，不默认展示。

选择状态：

- `auto_selected`：AI Talk 自动采用，不要求用户逐项确认。
- `choice_required`：组件、utility、同类实现或复用方式存在真实歧义，需要用户选择。
- `low_relevance`：不进入当前能力组合。

自动选择规则：

- 主 Skill、项目规则和适用 Prompt 自动采用。
- 唯一且高相关的项目内组件或 utility 自动写为 `prefer_reuse`。
- 唯一相关的项目内历史实现自动写为 `prefer_reference`。
- 自动选择使用 `selection_source: ai_talk`，但 `execution_validation` 仍为 `null`；自动采用不表示已经兼容。
- 共享或跨项目的组件、utility、历史实现，以及同类型存在多个高相关结果时，使用 `choice_required`。

用户只选择 `choice_required` 项：

- `prefer_reuse`：要求 Codex 优先验证复用。
- `prefer_reference`：仅作参考，不作为依赖。
- `excluded`：本次排除。

执行验证状态 `confirmed_reuse`、`partial_reuse`、`incompatible`、`reference_only` 只能由确认后的 Codex 实际读取和验证代码后给出。AI Talk 必须保持 `execution_validation: null`，不得为了确认候选而提前读取业务源码，也不得把用户选择升级为兼容性结论。

每次最多自动采用一个主 Skill 和必要项目规则；组件、utility 和历史实现仍受三个高相关项、两个辅助参考的展示上限约束。优先级为当前项目实现、项目 Skill、公司 Skill、公司组件、历史项目、用户 Prompt、默认规则。自动选择结果可在最终任务审查时通过“调整任务”修改。

## 规则冲突

发现用户要求、项目规则或多个 Skill 互相冲突时，不静默选择。显示冲突双方、影响和推荐处理方式，等待用户确认后再生成最终话术。

例如用户要求重新实现，而项目规则要求优先复用时，建议先验证已有能力；无法复用后再新增业务实现。该建议不能当作用户确认。

## 最终输出

默认先显示一屏内摘要：

```text
任务类型：
期望处理方式：
任务状态：待用户审查
相关范围：
主 Skill：
自动采用能力：
待选择候选：
用户已选复用：
用户已选参考：
本次排除：
尚未确认信息：
```

随后输出一个 `text` 代码块。按实际内容包含：当前需求、本轮目标、相关范围、期望处理方式、自动采用的主 Skill/规则/能力、用户对歧义候选的选择、项目约束、禁止事项、输出要求、验收要求和尚未确认的信息。省略没有实际内容的字段，简单任务控制在约 150 至 300 个中文字符。

复用要求必须告诉 Codex：实现前读取候选真实代码；检查 props、数据结构、依赖、配置和样式覆盖能力；完全兼容时复用；部分兼容时说明适配范围；不兼容时说明原因；不得为了强行复用而大改公共组件；参考能力不得默认成为项目依赖。

无可靠候选时说明检查过的范围，并要求 Codex 在执行阶段再次检查目标目录和同类实现，确认没有可复用能力后再新增。

代码块后固定显示：

```text
任务话术已准备，等待审查。
当前尚未执行代码修改。

确认任务
调整任务
取消
```

进入 `ready_for_review` 后立即停止：不继续读取业务代码、不运行项目命令、不修改文件、不自动提交给 Codex。

## 统一约束

- 只使用真实读取的项目事实和能力，不编造路径、Skill、组件、接口字段、运行结果或上一轮结论。
- 不读取 `.env`、密钥、令牌、依赖目录或构建产物，不把整个项目注入话术。
- 路径不存在、公司目录未配置或能力搜索失败时正常降级，不阻塞任务整理。
- AI Talk 不维护模板管理系统，不开发独立 UI、MCP App、后台、导入导出、云同步、团队账号、插件市场、完整 Git 审计或复杂数据看板。
- 不替 Codex Plan 展开详细实施步骤，不执行任何代码修改。
