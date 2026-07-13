---
name: ai-talk
description: 在用户显式调用 $ai-talk 时，识别自然语言研发任务，读取有限项目上下文，自动匹配内部 Skill、规则和可复用能力。简单明确任务跳过确认卡直接交给 Codex；复杂任务通过轻量任务卡展示目标、范围、约束和风险，用户一次点击即可开始执行。仅在组件、utility 或复用方式存在真实歧义时要求选择。
---

# AI Talk

把自然语言需求整理成可执行任务，并在真正需要时提供一次轻量确认。AI Talk 不是模板管理器，不维护搜索、分类、模板编辑、导入导出或后台系统。

## 固定流程

1. 从当前输入、对话、附件、截图、已给路径和项目上下文提取已知信息，不重复询问已经回答的内容。
2. 读取 `references/capability-reuse.md`，只运行一次 `scripts/collect_context.py --root <项目根目录> --query '<当前需求与已确认补充>'`。用户给出路径时增加 `--related`；已知公司目录时增加 `--source-root`。这是 AI Talk 准备阶段唯一允许运行的项目命令。
3. 使用 `task_context.task` 识别场景和期望执行方式，使用 `task_context.capabilities` 自动采用明确能力，并使用 `task_context.confirmation` 决定是否展示任务卡。
4. 按场景读取 AI Talk 自身的 reference。reference 中的定位、实现和验证要求只写入完整任务话术，AI Talk 准备阶段不得提前执行。
5. `confirmation.presentation == bypass` 时，不展示确认卡、不要求用户输入“继续”或“确认任务”。直接结束 AI Talk 准备阶段，把 `confirmation.task_prompt` 作为当前任务交给正常 Codex 流程继续处理。
6. `confirmation.presentation == card` 时，调用 MCP 工具 `show_ai_talk_task`，参数只传完整的 `task_context.confirmation`。工具可用后不要再重复输出一份长文本卡片。
7. `confirmation.state == ready` 时等待用户点击“开始执行”；点击产生的完整任务消息就是明确执行授权，后续进入正常 Codex 流程。
8. `confirmation.state == needs_confirmation` 时只突出需要调整的范围、规则冲突或复用方式。用户完成选择后卡片回到 `ready`。
9. `confirmation.state == blocked` 时只询问 `blocking_question` 这一项。不得一次列出多个问题。
10. MCP Apps 不可用时降级为紧凑文本确认摘要，仍遵守相同状态和调整边界；不得虚构可点击按钮或输入框写入能力。

## 准备与执行边界

- AI Talk 准备阶段只负责理解、能力发现和任务确认，不修改业务代码。
- `collect_context.py` 是准备阶段唯一允许运行的项目命令。不得额外运行 `rg`、Git 定位、构建、测试、开发服务器或业务脚本。
- 不打开候选页面、组件、接口、composable、hook、utility、测试或历史活动源码。真实兼容性检查留给开始执行后的 Codex。
- 用户点击“开始执行”或任务命中 `bypass` 后，AI Talk 准备阶段结束；随后按任务话术和匹配到的主 Skill 进入正常 Codex 分析、修改与验证流程。
- 不把“帮我开发”“修复”本身当作复杂任务卡的确认；是否展示卡片由 `confirmation.presentation` 决定。

## 任务卡契约

任务卡必须展示：

- `task_type`：任务类型。
- `execution`：期望执行方式。
- `goal`：任务目标。
- `scope`：代码或页面范围。
- `internal_skills`：匹配到的内部 Skill。
- `reusable_capabilities`：组件、utility 或同类实现。
- `constraints`：AI Talk 补充的关键约束。
- `risks` / `unconfirmed`：风险和未确认信息。

任务卡状态：

- `ready`：信息足够，突出“开始执行”。
- `needs_confirmation`：存在组件/复用歧义、公共能力风险、范围扩大或规则冲突，突出调整区域。
- `blocked`：缺少真正阻塞的信息，只显示一个问题，不能开始执行。

`presentation` 只有 `card` 和 `bypass`。简单明确任务使用 `bypass`；多场景、规则冲突、公共能力、范围扩大、未决复用方式或缺少关键信息时使用 `card`。

## 三个按钮

### 调整

只允许修改：

- `execution_mode`：`analyze / plan / modify_and_verify / review`。
- `scope`：任务涉及的代码或页面范围。
- `use_capabilities` 和 `capability_preferences`：是否采用内部能力，以及歧义候选的 `prefer_reuse`、`prefer_reference`、`excluded`。

不得在调整区加入目标重写、模板编辑、搜索、分类、导入导出或完整表单。

### 插入输入框

公开 MCP Apps 协议当前没有“只写入 Codex composer 草稿但不发送”的接口。按钮必须保持 `auto_send: false`：宿主没有草稿写入能力时复制完整 `task_prompt`，并明确提示用户未自动发送。禁止使用 `ui/message` 冒充输入框插入。

### 开始执行

只有 `state == ready` 时启用。用户点击后通过 MCP Apps `ui/message` 发送当前完整 `task_prompt`，一次点击即开始，不再要求输入“继续”。未经点击不得发送。

## 场景识别

第一版重点支持：

- Bug、报错、异常、偶现或定位原因：`bug_debugging`，读取 `references/bug-debugging.md`。
- 截图、Figma、视觉走查或页面还原：`ui_reconstruction`，读取 `references/ui-review.md`。
- 语言迁移、语言包或文案遗漏：`localization_migration`，读取 `references/ui-review.md`。
- 接口文档、OpenAPI、字段映射或联调：`api_integration`，读取 `references/api-integration.md`。
- 新页面、新功能或新模块：`feature_development`，读取 `references/feature-development.md`。

一个需求可以有多个场景。无法识别时使用 `unknown`，按通用任务整理规则继续。

## 执行方式

- `analyze`：只分析，不修改。
- `plan`：先给方案，用户未说明时默认使用。
- `modify_and_verify`：修改并验证。
- `review`：只审查，不修改。

这些值描述开始执行后的 Codex 行为，不是 AI Talk 准备阶段的修改授权。

## 能力选择

能力类型包括 `skill`、`component`、`utility`、`example`、`project_rule`、`prompt`；来源包括 `company`、`project`、`user`。

- 主 Skill、项目规则和适用 Prompt 自动采用。
- 唯一且高相关的项目内组件或 utility 自动设为 `prefer_reuse`。
- 唯一相关的项目内历史实现自动设为 `prefer_reference`。
- 自动采用使用 `selection_source: ai_talk`，但 `execution_validation` 保持 `null`。
- 多个高相关实现竞争同一职责，或只有公司级、共享、跨项目能力且适配不明确时，使用 `choice_required`。
- 用户只选择 `choice_required` 项；选择写入 `selection_source: user`。

执行验证状态 `confirmed_reuse`、`partial_reuse`、`incompatible`、`reference_only` 只能由开始执行后的 Codex 实际读取代码后给出。

## 规则冲突与风险

发现用户要求、项目规则或多个 Skill 冲突时，不静默选择。任务卡显示冲突影响，并进入 `needs_confirmation`。

涉及公共组件、共享能力、跨项目复用或范围扩大时，在 `risks` 中清晰提示，但不要使用阻断式大段警告。只有信息缺失导致任务无法执行时才使用 `blocked`。

## 降级输出

MCP Apps 工具不可用时，输出一屏内摘要：任务类型、执行方式、目标、范围、内部 Skill、可复用能力、关键约束、风险和状态。

- `ready`：提供“开始执行 / 插入输入框 / 调整”文本选项，等待明确选择。
- `needs_confirmation`：只要求调整未决字段。
- `blocked`：只询问一个 `blocking_question`。
- `bypass`：不输出摘要，直接进入正常 Codex 流程。

## 统一约束

- 只使用真实读取的项目事实和能力，不编造路径、Skill、组件、接口字段或兼容性结论。
- 不读取 `.env`、密钥、令牌、依赖目录或构建产物，不把整个项目注入话术。
- 路径不存在、公司目录未配置、能力搜索失败或 MCP Apps 不可用时正常降级。
- 不重新开发模板管理、搜索、分类、模板编辑、导入导出、云同步、团队账号或复杂数据看板。
- 卡片内容默认应在一屏内完成，避免大量说明和复杂动画。
