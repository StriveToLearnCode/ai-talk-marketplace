# Legacy Router Protocol

这是 AI Talk 0.4 的 CLI 路由协议，仅用于维护 `scripts/route-company-skills.mjs` 及其兼容测试。正常 `$ai-talk` 对话不得读取或执行本文件，不得据此检索仓库、推荐 Skill 或进入编码阶段。

## 目录

- 工作流与截图提取协议
- TaskHandoff 1.1 与阶段隔离
- 默认输出、项目与检索边界
- 执行模式、handoff 与必测场景

# AI Talk 增量上下文增强（Legacy）

AI Talk 保留开发者的自然语言，只补充公司 Skill、组件、Docs 和仓库检索所需的增量上下文。用户不应重新理解或审查一份 AI 改写后的任务。

它不替代公司的 Skill，也不直接负责写代码。

AI Talk 负责给出最多 2 条高价值增量事实、一条任务专属工程判断、最多 3 个真实检索入口和下一 Skill，不生成改写后的任务目标或研发分析报告。

不得改写、扩展或重新定义以上定位。

## 工作流

1. 移除 `$ai-talk` 调用标记，将完整原话保存到 `task.source_request`；不得生成或展示改写后的任务目标。
2. 判断原话是否存在会改变实施方向的真正歧义。只有硬阻塞时询问，最多一个问题；清晰 Bug、明确蒙层、弹窗开发和页面检查均不属于歧义。
3. 只提取附件、代码或原话中真正新增的高价值事实，最多 2 条。同义改写和泛化关键词不算增量。
4. 生成一条 1～2 句的任务专属工程判断：用现象缩小范围，解释优先排查层，但不得把可能原因写成已确认根因。
5. 检索公司代码、组件、Docs 或 Skill 索引；只保留真实命中的文件、符号、配置或 Skill，最多 3 项。状态未同步和故障归属诊断固定覆盖控制层、数据层、渲染层。
6. 根据原话中的动作意图确定 execution mode；明确修改意图不得降级为只读或再次询问授权。
7. 生成唯一事实源 `execution_plan`，再单向投影 `added_context`、`skipEnhancement` 和 `execution_prompt`。若 mode 为 `modify_and_verify`，宿主支持 Skill handoff 时在同一轮直接进入建议 Skill；宿主不支持时只保留 `▶ 下一步` 中的唯一 Skill 入口。

```bash
node scripts/route-company-skills.mjs \
  --root '<项目根目录>' \
  --query '<用户原始输入>' \
  [--evidence-type 'visual=<附件摘要>'] \
  [--evidence-json '<typed entry>']
```

保留重复的 `--evidence-type` 作为粗粒度兼容入口：`visual`、`interaction`、`api`、`screenshot`、`selected_code`。截图研发信息使用重复的 `--evidence-json` 传入，每个参数只能包含一个 JSON 对象。附件使用 `attachment_N` 稳定标识。

## 截图提取协议

按以下顺序提取，不得只输出“某图是目标 UI”：

1. 附件关系：用 `attachment_reference` 和 `role: target | reference | comparison` 保留用户指定关系。
2. 可见 UI：用 `ui_element`、`ui_structure` 记录直接可见元素和结构。
3. 交互与语义：用户明确的点击、跳转、条件、状态变化使用 `interaction`；明确的进度含义使用 `progress_semantics`。
4. 数据需求：只写开发需要的数据，用 `data_requirement` 和 `status: unknown` 表达，不生成字段名。
5. 复用资源：用 `resource_reference` 或 `resource_reuse_candidate` 记录资源、provider、附件来源和可复用性；未确认的 key 单独写成 `resource_key` unknown。
6. 验收目标：从已确认的 UI、交互、状态语义和复用要求生成 `ui_assertion`、`interaction_assertion`、`state_assertion`、`resource_assertion`，不伪造命令。

### 证据状态

- `fact`：用户明确说明的内容，或截图中直接可见的内容。截图可见只证明页面表现。
- `inference`：基于图片关系、风格或项目上下文得出的结论；必须保留来源并填写 `confidence: high | medium | low`。
- `unknown`：页面路径、组件名、接口字段、真实数据源、资源 key 等尚未定位的信息；只能进入 blocker kind，不得进入 `source_facts`。

所有 typed entry 必须包含 `kind` 和 `source`。事实与推断必须包含合法 `status`；blocker 必须使用 `status: unknown`。不得因为截图中的视觉状态猜接口字段、状态枚举、资源 key 或具体实现。

## TaskHandoff 1.1

保持以下顶层结构，不增加 `development_context` 等并行事实源：

```yaml
schema_version: "1.1"
route: { skill, authorization }
workspace: { project_root, workdir }
workflow: { execution_mode, next_skill, stage: { value, source, status } }
task: { source_request, deliverable, reasoning }
knowledge_requirements: []
retrieval: []
target_scope: []
source_facts: []
constraints: []
blockers: []
verification: []
```

- `source_facts` 只保存 fact/inference typed entries 和旧 evidence 的 fact 规范化结果。
- 诊断代码事实使用 `diagnostic_fact`，保留 `layer: control | data | render`、稳定 `signal`、原始 `description` 和源码 `source`。用户给出 `文件:行号` 时必须保留到 `target_scope.line`。
- `task.reasoning` 保存工程判断；`knowledge_requirements` 只保存知识名；`retrieval` 每项固定为知识、真实实现入口、检索原因和来源。
- `blockers` 新条目使用 `{ kind, description, status: unknown, resolution, blocking }`；`search_resolvable` 默认 `blocking: false`。renderer 和授权 handoff 仍须读取旧字符串 blocker。
- `verification` 保存行为级 assertion；故障归属使用 `responsibility_condition` 保存 `condition`、`owner` 和可验证描述，不得用不可靠的 lint、test 或 e2e 命令填充。
- 截图任务默认约束不得猜接口字段或业务枚举；有 Page Center 事实时优先复用；页面和组件未确认前不得扩大修改范围。
- `modify_and_verify` 直接对应 `route.authorization: authorized`；其他 mode 保持 `inspect_only`。
- `plan_then_execute` 若当前 Skill 只负责方案，使用 `workflow.next_skill` 保存已安装的实施 Skill，确认后切换 `route.skill`。

### 字段稳定性

Stable：

- `schema_version`
- `route.skill`
- `route.authorization`
- `task.source_request`
- `task.reasoning`
- `knowledge_requirements`
- `retrieval`
- `target_scope`
- `source_facts`
- `constraints`
- `blockers`
- `verification`
- `execution_prompt` renderer

Experimental：`development_context`、`ui_requirements`、`interaction_requirements`、`data_requirements`、`reusable_resources`、`acceptance_assertions` 目前只表示 typed entry 的研发维度，不得新增为顶层字段。

Reserved：`planned_changes`、write scope enforcement、source precedence engine、resolved plan lifecycle。当前没有生产消费者，不得写入协议或假装生效。

## 阶段隔离

- 理解只消费用户输入与 typed evidence，并产出任务语义和知识对象。
- 检索只消费理解阶段生成的 RetrievalRequest 和 Skill `name/description` 索引，并产出带证据的真实入口。
- Formatter 只消费已校验的 TaskHandoff，不得读取原始输入、项目文件、Skill 或旧兼容字段。
- 三阶段只能单向传递；不得解析 `execution_prompt` 回填事实。

## 默认输出

默认 CLI 输出由 `execution_plan` 单向渲染，只允许按需出现：`🧩 已补充上下文`、`🧠 AI 判断`、`🔍 公司检索入口`、`⚠️ 需要确认`、诊断专用的 `🧪 定责条件`、`▶ 下一步`。不得展示改写后的任务目标、截图完整描述、文件扫描列表、通用实现边界、通用验收标准、AGENTS、README 或普通依赖。

`🧩 已补充上下文` 最多 2 条，只写附件、代码或原话能够支持的高价值新增事实，不输出会在判断和检索入口中重复出现的关键词清单。多图任务只补充目标图、参考图和对比图的关系；接口与页面状态冲突只补充冲突关系。

`🧠 AI 判断` 使用 1～2 句，必须针对当前任务缩小故障范围，并说明为何优先检查相应层次。禁止输出通用规范、范围声明或无具体意义的“建议检查相关代码”；使用“更可能”“应先确认”等措辞保留不确定性。

`🔍 公司检索入口` 固定使用“知识对象 → 真实入口（用途）”，最多 3 项。只展示真实命中的公司代码、组件、Docs 或 Skill；不得用“公司 Docs”“当前项目实现”“同类组件”“相关 Skill”等泛化内容占位，找不到时隐藏整个模块。

标准 Bug 不得以找到一个入口作为早停条件。任务明确且已生成工程判断后，至少找到两个覆盖不同排查层的真实入口再早停；若只找到一个真实入口则如实展示，但必须先用完受限检索预算。

`⚠️ 需要确认` 只在存在 `blocking: true` 的硬阻塞时展示，最多 1 条。`search_resolvable` 不展示。

当目标、文件和修改内容已经明确，未找到额外公司入口，或增强只是同义改写时，设置 `skipEnhancement: true`，输出“当前需求已经明确，无需额外增强。”，然后只显示 `▶ 下一步`。存在硬阻塞时不得跳过增强。

`--format json` 输出 `execution_plan`、`execution_prompt` 和旧顶层兼容投影。`--debug-json` 才能增加 `_debug`。

## 项目与检索边界

- 总处理时间目标不超过 45 秒；最多搜索 2 次；单文件正文最多 128 KiB；项目上下文正文最多读取 4 个文件；候选文件元数据最多索引 240 项。
- 多图 UI 固定快速路径只读取用户原话和附件、一个用户明确目标文件、目标文件就近一份 `AGENTS.md`、最多一个目标文件真实引用的同类实现，以及最多一个真实资源或 Page Center 来源。无明确目标文件时不得全仓兜底。
- 非 Bug 获得足够增量信息或可靠入口后立即停止扩展；标准 Bug 至少覆盖两个不同排查层，或达到 45 秒预算后停止。
- 禁止递归读取依赖树、扫描所有 `AGENTS.md`、遍历 Docs、读取普通直接依赖或为增加候选持续扩大范围。Skill 只使用 name/description 索引；确定命中后才由后续执行轮读取正文。
- 对路径执行 `realpath` 校验；拒绝 `node_modules`、仓库外符号链接、超大文件和无关目录扩展。
- 推荐入口必须有以下至少一项证据：目标真实引用、目标 UI 结构一致、同类页面真实使用、明确组件文档或 Skill 索引、用户明确指定。文件名只用于限量初筛，不构成推荐证据。
- 文件名、变量名、接口名、资源路径和 Skill 名称不得翻译或改写。
- 目标 Skill 不存在时保持空值并给出安装、启用或 `--source-root` 的下一步，不改选其他职责 Skill。

## 执行模式与 handoff

- `开发`、`实现`、`新增`、`接入`、`修改`、`修复`、`直接改` 等明确动作词设置 `modify_and_verify`、阶段 `修改代码` 和 `route.authorization: authorized`，不得再次询问。
- 即使省略“修改”等动作词，只要原话明确给出“事件触发 + 期望效果”（如“点击 tab 时播放 audio/btn”），也按代码修改处理；“为什么不播放”“只排查”等疑问或诊断表达仍保持 `inspect_only`。
- `排查`、`为什么`、`分析`、`定位原因`、`只看看` 等诊断表达设置 `inspect_only`、阶段 `定位问题`，不得修改代码。
- “选择/提交/切换后没变化、未更新、不生效”等操作后状态未同步现象属于 Bug，不得描述为新增页面功能。纯代码诊断由当前执行者按检索入口继续排查，不推荐或强制安装 `gen-code`；用户明确要求修复时才路由到代码实施 Skill。
- “前端还是后端”本身是故障归属诊断，稳定使用 `inspect_only`。从用户指定的文件和行号出发，依次定位控制层（点击、确认、失败关闭）、数据层（接口调用、状态回写、请求锁）和渲染层（最终消费字段）。
- 定责必须写成可观测条件：操作接口失败但页面仍关闭为前端错误处理；接口响应有新值但页面仍显示旧值为前端状态同步；操作成功且重新查询仍返回旧值为后端持久化或查询。
- 已确认的接口响应、被丢弃的返回值、请求锁风险和最终渲染字段必须以 `diagnostic_fact` 进入 handoff。证据足以表明响应已有新值且前端未消费时，工程判断可明确指出前端状态同步风险；否则保持待验证，不提前定责。
- `先给方案，确认后再改`、`先分析原因，确认后再改` 等分阶段表达设置 `plan_then_execute`；方案或分析完成后只确认一次。
- `帮我看看`、`处理一下`、`帮我改一下这个` 等缺少明确对象或无法判断是否允许修改的表达保持 `inspect_only`，最多询问一次“只定位还是修改并验证”。
- `Unknown custom element: <name>` 和 `Failed to resolve component: <name>` 属于清晰诊断请求；保留原始组件名，优先检索名称生成、注册映射和真实组件文件，不询问修改授权。
- 页面现场检查若只写“这个 URL”但未提供完整 URL，生成一个 URL 硬阻塞；提供真实 URL 后不得继续询问目标页面。
- 明确修改意图的 handoff 直接消费 `execution_plan.route.skill`。宿主支持下游 Skill 调用时同轮继续；不支持时只显示一个建议 Skill 入口，不输出授权口令、重复按钮或门禁说明。
- handoff 必须保留 typed entries、constraints、blockers 和 verification；`plan_then_execute` 的一次确认只更新 mode、阶段和授权状态。
- `inspect_only` 诊断收到“执行”“开始执行”等续接词时，不切换修改模式、不要求 Skill；直接消费上一轮 handoff 继续抓包或检查指定数据链，禁止重新分类和大范围扫描。

## 必测场景

- 用户指定某张截图为目标时保留附件引用，多图区分 target/reference/comparison。
- 用户明确的点击、跳转和进度业务含义进入协议，不生成字段或枚举。
- Page Center 资源保留候选、provider 和真实附件来源；具体 key 未确认时进入 search-resolvable unknown。
- Page Center 具体 key 只有真实配置或附件明确存在时才能展示；否则使用“图 N 的 Page Center 配置”。
- 性能回归记录总处理时间、读取文件数、Skill 正文读取数、搜索扩展次数和早停原因；所有场景目标不超过 45 秒、2 次搜索、4 个文件，Skill 正文读取数默认为 0。
- inference 不进入 fact，unknown 不渲染成已确认，verification 包含行为验收目标，但这些内部事实不展开到 Formatter。
- execution prompt 只从 execution plan 渲染；输出只能出现允许的五个模块，非阻塞 unknown 必须隐藏。
- 清晰 Bug 不合成原话或证据未支持的事实；明确文案修改设置 `skipEnhancement: true`；多图只补图片关系；接口和页面冲突只补冲突关系；“帮我改一下这个”只询问一个问题。
- 继续覆盖状态含义保护、资源/路径区分、受限项目读取、职责匹配路由和基于原始意图的执行模式。
- 覆盖 `文件:行号`、三层故障链、四类高价值诊断事实、三条定责条件，以及“执行”后的无损只读续接。
