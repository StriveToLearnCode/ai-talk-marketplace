---
name: ai-talk
description: 在用户显式调用 $ai-talk 时，将自然语言、截图、文件和代码上下文整理为简短中文研发协议：逐字保留用户原意，基于当前证据生成任务专属工程推断，在显式目标范围内只读补齐项目上下文，并给出实现约束与可选 Skill。解析轮不得修改项目或调用下游 Skill；只有用户后续明确授权才允许执行。
---

# AI Talk 研发执行协议生成器

把研发输入转换为可核对、可执行、可交接的协议。不要只改写用户的话；先保留原意，再提供用户没有必要亲自补齐的研发信息。

## 工作流

1. 移除 `$ai-talk` 调用标记，逐字保留其余用户原意、限定条件、不确定性和技术标识。
2. 仅根据当前描述、附件和真实项目上下文生成任务专属工程推断；证据不足时省略推断。
3. 按通用、任务类型、项目证据三个来源生成内部默认规则，删除冲突规则，并在用户输出中归入最多 2 条实现约束。
4. 在显式目标范围内执行受限只读，补齐目标文件、项目规则、一层本地依赖、资源、接口和附件上下文。
5. 运行 `scripts/route-company-skills.mjs`，生成 schema v6 兼容协议；只在高置信时输出建议 Skill。
6. 输出协议后立即停止。不要修改文件、调用下游 Skill、自动 handoff 或开始实施。

```bash
node scripts/route-company-skills.mjs \
  --root '<项目根目录>' \
  --query '<用户原始输入>' \
  [--evidence-type 'visual=<附件摘要>']
```

附件按实际角色重复传入：

- `visual=<附件摘要>`：视觉稿或设计稿。
- `interaction=<附件摘要>`：交互图或流程图。
- `api=<附件摘要>`：接口资料。
- `screenshot=<附件摘要>`：真实截图。
- `selected_code=<选中内容摘要>`：编辑器明确提供的选中代码。

只有调试和测试可以增加 `--debug-json`。旧 `--profile-json` 协议保持禁用。

## 输出协议

### 用户原意

- 逐字保留移除调用标记后的原话，不修正语气、标识符、路径或用户表达的不确定性。
- 不把用户原意替换为总结、改写或推测后的需求。
- 内部执行目标不得替代用户原意，中文最多 50 个中文字符。

### AI 推断

AI 推断只回答：当前证据更支持哪类研发情况，以及执行时应优先确认哪些具体对象。必须同时包含证据依据、工程判断和优先关注点，保持 1～3 句且不超过 100 个中文字符。

- 只能使用当前用户描述、附件和真实项目上下文中的证据，不能只根据 `feature_create | feature_modify | bug_fix` 等任务类型套固定模板。
- 可以判断更可能是已有节点的状态展示扩展、单节点异常、状态映射冲突或新增 UI，但不能断言未经验证的字段含义、数组下标、组件或根因。
- 不确定时使用“更可能……，需要从现有代码确认”，不得使用“一定、就是、必然、已经确认”。
- 没有足够证据产生有价值的工程判断时，整个“AI 推断”模块省略，不用通用规则填充。

### 实现约束

内部 `default_rules` 每项保留 `value`、`source` 和可选 `evidence`，最多 5 条：

- `universal`：不引入用户未确认的业务逻辑、限制无关修改等稳定规则。
- `intent`：按 `feature_create | feature_modify | bug_fix | ui_inspection | planning | automated_test` 补充任务型规则。
- `project`：只引用真实 `AGENTS.md` 或显式目标的一层直接依赖，不虚构项目规范。

默认规则不能扩大业务需求。用户明确要求重写、不复用、全局重构或只读分析时删除冲突规则。用户输出不显示规则来源标签，只选取最多 2 条作为“实现约束”，不得混入“AI 推断”。

### 项目上下文

只读取以下范围：

- 用户或编辑器明确指出的目标文件、目标目录和资料。
- 从项目根到目标路径逐级生效的 `AGENTS.md`。
- 显式目标文件的一层相对本地导入。
- 真实附件、选中代码、资源标识和接口标识。

对所有路径执行 `realpath` 校验，确保位于 `--root` 内。禁止读取 `node_modules` 和仓库外符号链接；不读取无关兄弟模块或递归目录。最多读取 8 个文件，单文件最多 128 KiB。不存在、不可读、越界或超限时停止扩展，把原因写入 Handoff 待确认。

上下文项使用 `type | value | source`，类型包括 `target_file | target_directory | project_rule | direct_dependency | visual_design | interaction_flow | api_document | screenshot | selected_code | asset_resource | api`。文件名、变量名、接口名、资源路径和 Skill 名称不得翻译或改写。

### 建议 Skill

内部继续生成 Handoff，并保留执行重点、待确认项和中文检索语义。用户输出只在满足高置信规则时显示建议 Skill；没有高置信结果时省略整个“建议 Skill”模块，不强制选择最接近的 Skill。

建议 Skill 不构成执行授权。不要输出评分、候选 Skill、内部 Query、selection explanation 或自动执行提示。

## schema v6

调试结果新增并保留以下字段：

```yaml
schema_version: 6
original_goal: 用户原始输入
execution_goal: 规范化执行目标
default_rules:
  - value: 规则内容
    source: universal | intent | project
    evidence: 可选项目证据
project_context:
  - type: 上下文类型
    value: 已确认值
    source: 用户、附件或项目来源
skill_handoff:
  execution_focus: 执行重点
  unresolved: 真正影响执行的待确认项
  retrieval_semantics: 中文检索语义
  recommended_skill: 高置信 Skill 或 null
```

继续保留 `confirmed_context`、`intent`、`entities`、`retrieval_query_groups`、`retrieval_queries`、`retrieval_directions`、`boundaries`、`unknowns`、`recommended_skill` 和 `routing`，兼容现有路由与评估调用方。

## 默认中文输出

按以下顺序输出，空栏目省略：

```text
用户原意：
<移除 $ai-talk 标记后的原话>

AI 推断：
<1～3 句、100 个中文字符以内的任务专属工程判断>

项目上下文：
- 目标文件：<相对路径>
- 项目规则：<规则文件>
- 直接依赖：<一层本地依赖>
- 资源：<原始资源标识>
- 接口资料：<真实接口事实>
- 截图：已提供（<来源>）

实现约束：
- <最多 2 条通用、范围或项目规则>

建议 Skill：
<仅高置信时出现>
```

英文输入继续使用英文 Execution Protocol，保持现有兼容格式。

## 事实边界

- 截图只证明页面表现，不复述 OCR，不得直接当作接口数据、状态含义或代码实现事实。
- `state=0` 不能直接解释为已领取或未领取，也不能直接判定为接口问题。
- 附件、代码、接口或文档冲突时，不得直接判定哪一方正确。
- `icon/mask` 等资源标识属于资源，不能因为包含 `/` 就识别为目录。
- “第三个奖励”只确认第 3 个奖励节点，不得无依据补出 `rewardList[2]` 或领取状态。
- 中文研发语义使用奖励状态映射、奖励展示条件、积分阶段任务关联、进度展示逻辑和当前项目同类实现等自然短语；不要输出英文 ontology。

## Skill 路由

只索引运行时 `.agents/skills/**/SKILL.md`、显式批准的公司 Skill 根和插件自带 `ui-self-check`。只读取 frontmatter、description 和明确的适用场景短段；不索引 `plugins/ai-talk/docs/skills/`，不读取 references、脚本、知识库或普通正文。

高置信要求：recommendation 分数至少 70，领先下一候选至少 15 分，目标产物不为 unknown，名称与运行时索引一致，并有明确的目标产物或执行方式信号。单个“页面”“显示”“测试”等弱词和任意 `score > 0` 都不足以输出 Skill。

## 执行授权门禁

- 解析轮只允许上述受限只读；禁止修改文件；禁止调用任何下游工具或 Skill；禁止自动 handoff。
- 只有上一轮已生成协议，且用户在后续独立一轮明确输入 `开始执行`、`直接修改`、`使用这个协议继续` 或 `调用 gen-code 执行`，才允许进入执行。
- 引用、转述或列举授权表达不算授权。门禁通过后才可调用 `skill_handoff.recommended_skill` 或兼容字段 `recommended_skill`。

## 必测场景

- 原话包含 `$ai-talk`、路径、配置变量和“不确定”表达时，输出只移除调用标记，其余逐字保留。
- 显式目标存在时，读取目标、沿路径 `AGENTS.md` 和一层相对依赖；不读取无关兄弟文件。
- 仓库外符号链接、`node_modules`、超大文件和缺失文件进入待确认，不泄漏文件内容。
- “不要复用现有实现，可以全局重构”抑制冲突默认规则，不改写原意。
- 没有足够任务证据时省略 AI 推断，不得用通用约束补位。
- 没有高置信 Skill 时省略建议 Skill 模块，内部 Handoff 保持兼容。
- `state=0 页面却显示已领取`保留接口事实和页面表现，不猜状态业务含义。
