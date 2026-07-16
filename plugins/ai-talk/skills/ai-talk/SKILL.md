---
name: ai-talk
<<<<<<< HEAD
description: 在用户显式调用 $ai-talk 时，将研发需求和真实附件整理为最小 Task Contract，识别会影响业务结果、修改范围或实现方向的 Context Gap。只描述缺口并建议后续来源，不搜索项目、不读取公司 Docs、不调用下游 Skill、不规划检索顺序，也不扩展用户需求。
---

# AI Talk Context Gap 标注器

保留用户原始目标，从用户原话、真实附件和编辑器已提供的上下文中提取已确认事实、研发概念、关系与冲突，并输出供后续 Codex 自行检索和执行的 Task Contract。

## 执行流程

1. 原样保留用户目标；只移除 `$ai-talk` 调用标记。
2. 运行一次 `scripts/route-company-skills.mjs`。附件按真实内容传入重复的 `--evidence-type`：
   - `visual=<附件摘要>`
   - `interaction=<附件摘要>`
   - `api=<附件摘要>`
   - `screenshot=<附件摘要>`
   - `selected_code=<选中内容摘要>`
3. 使用脚本默认文本作为最终 Task Contract。只有调试和测试可以增加 `--debug-json`。
4. 生成 Task Contract 后停止。不要搜索项目、读取公司 Docs、调用 Skill、安排检索顺序或开始实施。

```bash
node scripts/route-company-skills.mjs \
  --query '<用户原始输入>' \
  [--evidence-type 'visual=视觉稿摘要']
```

历史参数 `--root`、`--source-root`、`--exclude-root`、`--limit` 和 `--top-k` 仅为调用兼容而接受，必须忽略，不得据此读取文件或建立 Skill 索引。

## 支持的任务类型

- `feature_create`：重点判断 `target_scope`、`expected_behavior`；仅在需求实际依赖时判断 `visual_reference`、`interaction_rule`、`data_source`。
- `bug_fix`：重点判断 `issue_symptom`、`target_scope`；仅在问题实际涉及对应信息时判断 `expected_behavior`、`reproduction_condition`、`state_mapping`。
- `ui_modify`：重点判断 `target_scope`、`visual_change`；仅在修改实际依赖时判断 `state_condition`、`asset_resource`。
- `ui_inspection`：重点判断 `page_entry`、`inspection_goal`。
- `planning`：重点判断 `goal`、`scope`。

不得把设计稿、接口、目标文件或测试设为所有任务的固定必填项。

## 结构化结果

调试结果包含：

```yaml
original_goal: 用户原始目标
intent: feature_create | bug_fix | ui_modify | ui_inspection | planning
confirmed_context:
  - type: 上下文类型
    value: 已确认信息
    source: user_text | user_text:path | attachment:<序号>
entities: 带 value、label、source 的研发概念
relationships_and_conflicts:
  - 已确认信息之间的关系、冲突或待验证关系
unknowns:
  - type: 缺口类型
    reason: 缺失信息为何会影响任务
    blocking: true | false
    suggested_source: project | docs | skill | user
boundaries:
  - 任务边界
acceptance_criteria:
  - 验收标准
```

每个 `unknowns` 项只能包含 `type`、`reason`、`blocking` 和可选的 `suggested_source`。

## Context Gap 判断

- 用户原话、真实附件或编辑器真实提供的信息已覆盖的内容不算缺口。
- `blocking=true` 只用于缺失信息会改变业务结果、修改范围或实现方向的情况。
- `blocking=false` 表示 Codex 可在执行阶段自行确认，不打断工作流。
- 最多生成一个阻塞缺口；没有真实缺口时返回空数组，不制造占位 unknown。
- 不输出固定“期望交付物尚未明确”。
- `icon/mask`、`icon/close`、`progress/bg-1` 等图片或图标标识属于 `asset_resource`，不是目录或 `target_scope`。
- 截图只能证明页面表现，不得直接当作接口数据、状态含义或代码实现事实。
- 状态值与页面表现冲突时，将 `state_mapping` 标为待验证关系，不直接推断状态值的业务含义。
- “开发一个弹窗”不得补充按钮、props、事件或样式。只有缺少 `target_scope` 确实导致无法确定修改位置时，才将其标为阻塞。
- AI Talk 只给出适合后续 Codex 理解的研发概念和缺口描述；不得生成检索计划、检索步骤或 Skill 选择。

## 默认 Task Contract

按以下顺序展示：
=======
description: 在用户显式调用 $ai-talk 时，将自然语言、截图、文件和代码上下文整理成规范化中文研发语义，并仅在高置信时标出下一 Company Skill。生成协议后必须停止，不调用下游 Skill、不运行命令、不读取或修改文件；只有用户在后续一轮明确授权执行时才允许进入匹配的 Skill。
---

# AI Talk Execution Protocol Builder

将用户输入转换为交给 Company Skill 的任务协议。不要回答研发问题，不要输出分析过程，不要猜根因，不要指定未经证据确认的实现。

## 工作流

1. 从用户输入、目标文件、选中代码和真实附件中提取已确认事实。
2. 将用户期望的最终结果规范化为一句任务目标，不复述原话。
3. 区分已知事实、待补齐知识、实现约束和真正影响方向的假设。
4. 运行内部检索与 Skill 路由；只把高置信 Skill 写入建议 Skill。
5. 输出协议后立即停止。需求解析轮禁止调用任何工具或 Skill，禁止运行命令，禁止读取或修改文件。

附件按实际内容传入重复的 `--evidence-type`：

- `visual=<附件摘要>`：视觉稿或设计稿。
- `interaction=<附件摘要>`：交互图或流程图。
- `api=<附件摘要>`：接口资料。
- `screenshot=<附件摘要>`：无法进一步分类的真实截图。
- `selected_code=<选中内容摘要>`：编辑器明确提供的选中代码。

只有调试和测试可以增加 `--debug-json`。旧 `--profile-json` 协议保持禁用。

## 四层职责

### Execution Protocol

中文输入只使用规范词表：`任务类型 | 任务目标 | 研发对象 | 状态 | 视觉效果 | 资源 | 配置变量 | 接口字段 | 关键关系 | 检索语义 | 实现约束`，高置信匹配时追加 `建议 Skill`。空栏目省略，避免同一概念出现多种叫法。

### Retrieval

`retrieval_query_groups`、`retrieval_queries`、`retrieval_directions` 只服务内部检索。Query Group 继续分为 `docs | skills | components | code`。中文输入的研发概念使用中文检索词；文件名、变量名、接口名、资源路径和 Skill 名称保持原样。

### Analysis

`intent`、`entities` 的 canonical value、routing profile、评分、候选、关系推导和 selection explanation 只用于内部判断，不进入协议。

### Presentation

formatter 只负责从现有字段组装协议、中文语义映射、去重、裁剪和栏目省略，不生成长报告，不展示英文 ontology。

## 内部结构

保留 `original_goal`、`confirmed_context[{type,value,source}]`、`intent`、`entities[type][{value,label,source}]`、`retrieval_query_groups{docs,skills,components,code}`、`retrieval_queries`、`retrieval_directions`、`boundaries`、`unknowns`、`recommended_skill`。

上下文类型为 `target_file | target_directory | visual_design | interaction_flow | api_document | screenshot | selected_code`，来源为 `user_text:path | user_text:explicit_reference | attachment:<序号>`。实体来源为 `user_text | user_text:path | attachment:<序号>`。

实体类型沿用 `task | ui_component | component | business_object | state | visual_effect | asset_resource | api | layout_scene | config_or_symbol | issue_symptom | target_scope`。这些字段是协议的来源，不是协议栏目。

## 协议规则

### 任务目标

用一句话回答 AI 最终应该完成什么。保留动作、目标对象和结果；规范化问题表达，不照抄用户原话，不加入用户未要求的功能。中文最多 50 个中文字符。

例如：

```text
积分阶段接入任务 7，复用现有方式展示进度和奖励。
```

### 研发对象及语义栏目

只放已经确认的研发事实。研发对象与状态、视觉效果、资源、配置变量、接口字段使用固定栏目，不另造同义栏目。

- 路径、变量、配置、API 和资源必须来自用户输入、真实附件或代码上下文，并逐字保持原样。
- 中文业务表达规范化为中文研发语义，例如“第三个奖励”写为“第 3 个奖励”，“奖励没显示”写为“奖励展示异常”，“领奖后加蒙层”写为“已领取状态增加蒙层”。
- 不得把中文研发语义改写为 `reward-index`、`reward-render`、`claimed-state`、`progress-rule` 或 `similar-implementation`。
- “第三个奖励”只确认奖励节点，不得无依据补出领取状态。
- 截图只贡献其中能确认的研发事实，不复述 OCR，不总结图片内容。
- 不写分析、建议、推测和待确认项。
- `icon/mask` 等资源标识进入资源栏目，不能因为包含 `/` 就识别为目录。
- 文件名、变量名、接口名、资源路径和 Skill 名称不得翻译或改写。

### 关键关系

使用简洁的 `来源或条件 → 结果` 表达已确认关系，例如 `任务 7 数据 → 积分阶段进度与奖励展示`。不得把推测写成关系。

### 检索语义

使用贴合公司中文 Skill、Docs 和组件知识的短语，例如 `奖励状态映射`、`奖励展示条件`、`积分阶段任务关联`、`进度展示逻辑`、`当前项目同类实现`。检索语义不是英文标签，也不是完整分析句。

### 实现约束

只写必须遵守的实现边界，例如复用现有展示方式、不影响其他阶段、不修改无关模块。优先消费 `boundaries` 中的真实约束；禁止“认真思考”“一步一步分析”等 Prompt 语言。

### 建议 Skill

只输出高置信匹配的真实运行时 Skill 名称。没有高置信结果时省略整个栏目，不输出候选、分数或占位符。

高置信要求：recommendation 分数至少 70，领先下一候选至少 15 分，目标产物不为 unknown，名称与运行时索引一致，并有明确的目标产物或执行方式信号。单个“页面”“显示”“测试”等弱词和任意 `score > 0` 都不足以输出 Skill。

- `midscene-test.ts` 或自动化测试产物匹配 `ai-test`。
- 浏览器即时检查匹配 `ui-self-check`；普通“测一下”不选择 `ai-test`。
- `docs/plan/` 前端方案匹配 `gen-frontend-plan`。
- 前端开发、已有功能修改或修复匹配 `gen-code`。
- Figma 仅作为开发证据时不选择分析 Skill。
- 只有 PageCenter 配置、活动积木、uiMeta 可配置玩法块等明确产物才匹配专用 Skill。

## 默认输出

中文输入始终以任务目标开始，栏目顺序固定；空栏目省略：
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)

```text
任务目标：
<规范化目标>

研发对象：
- <文件、变量或中文研发对象>

<<<<<<< HEAD
研发概念：
- <可靠研发概念>

关系与冲突：
- <已确认关系、冲突或待验证关系>

上下文缺口：
- <缺口原因>
  建议来源：<当前项目代码 / 公司文档 / 相关 Skill / 用户确认>。
  <阻塞说明或非阻塞执行阶段验证说明>

任务边界：
- <真实任务边界>

验收标准：
- <基于用户原话的验收标准>
```

没有缺口时省略整个“上下文缺口”区域，不输出“上下文已足够”等固定套话。无法可靠提取的研发概念行直接省略。

默认输出禁止展示内部字段名、JSON、评分、绝对路径、固定“期望交付物尚未明确”、检索计划、检索步骤或执行 Skill。不要扩展用户未确认的功能、交互、组件、数据结构和验收要求。

旧 `--profile-json` 协议保持禁用。
=======
状态：
- <规范化状态>

视觉效果：
- <规范化视觉效果>

资源：
- <原始资源路径>

关键关系：
- <来源或条件 → 结果>

检索语义：
- <中文检索语义>

实现约束：
- <实现边界>

建议 Skill：
- <高置信 Skill 名称>
```

英文输入可继续使用英文协议。不要输出英文 ontology、Development Report、OCR 总结、建议执行、验收标准、分析过程、评分、Prompt、内部 Query、候选 Skill 或调试字段。

## 不猜答案

- `state=0` 不能直接解释为已领取或未领取，也不能直接判定为接口问题。
- 附件、代码、接口或文档冲突时，不得直接判定哪一方正确。
- “图片没有显示”“替换奖励图片”“图标”“背景图”不是截图附件。
- “见截图、参考截图、截图如下、根据这张图”只代表明确引用；没有附件标记不得写“已提供截图”。

## Skill 索引

只读取运行时 `SKILL.md` 的 frontmatter、description 和明确标记的适用场景短段。索引 `.agents/skills/**/SKILL.md`、显式批准的公司 Skill 根和 `ui-self-check`；不索引 `plugins/ai-talk/docs/skills/`，不读取 references、脚本、知识库或普通正文。

## 执行授权门禁

- 建议 Skill 不构成执行授权，不得自动 handoff。
- 只有上一轮已生成协议，且用户在后续独立一轮明确输入 `开始执行`、`直接修改`、`使用这个协议继续` 或 `调用 gen-code 执行`，才允许进入执行。
- 引用、转述或列举授权表达不算授权。门禁通过后才可读取并调用上一轮 `recommended_skill`。

## 必测场景

- `为什么第三个奖励没显示`：任务目标为定位第 3 个奖励展示异常；检索语义包含奖励状态映射、奖励展示条件和当前项目同类实现，不输出英文 ontology，也不补出领取状态。
- `奖励领取后增加 icon/mask 蒙层`：状态为已领取状态，视觉效果为蒙层，资源路径保持 `icon/mask`。
- `积分阶段 PROGRESS_TASK_ID：7，然后一样展示进度和奖励`：任务目标保留任务 7 与复用结果；研发对象保留配置变量与积分阶段；关键关系和检索语义使用中文。
- `state=0 页面却显示已领取`：接口字段保持 `state=0`，检索语义使用状态映射和展示条件，不猜 `state=0` 含义。
- `开发一个弹窗`：研发对象只确认弹窗；检索语义使用弹窗组件复用、弹窗触发逻辑和弹窗交互逻辑。
- 中文模糊输入且没有可靠事实时只输出任务目标；英文输入可继续使用英文栏目。
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
