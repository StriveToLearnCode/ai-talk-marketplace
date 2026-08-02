# AI Talk 验收场景

## 触发模式

- 默认模式依赖 Codex 对 Skill description 的隐式匹配，测试记录真实触发率，不得把 fixture 中的期望路由写成 100% 宿主保证。
- 严格模式通过根 `AGENTS.md` 托管区块显式要求每条研发消息先应用 `$ai-talk:ai-talk`，同一条消息只执行一次。
- 两种触发方式使用完全相同的决策可见性和风险边界行为；严格模式只保证触发覆盖，不形成第二套产品模式。
- `install-strict-mode.mjs` 重复执行不得产生重复区块，`--remove` 只能移除托管区块，其他项目规则保持不变。
- 严格模式下 Skill 不可用时必须报告门禁未运行，不得静默声称已经放行。
- 非研发消息在两种模式下都不触发 AI Talk。

## 当前对话职责

正常 `$ai-talk` 对话先只用消息、已有上下文和活动任务状态做风险分级。目标已稳定绑定且消息没有跨模块或范围扩张信号的任务走无契约 Fast Path；未解析的视觉指代、引用提升、跨模块、范围限制、尚未定位的跨模块诊断实施、外部写入或歧义任务才编译为 `RequirementContract 1.4`。只询问会改变产品结果、数据语义或写范围的问题。

### 决策可见用户体验

- 内部推理、候选权衡和协议机械过程保持静默，不显示 route、authorization、schema、YAML、validator 输出或思维链。
- 纯 Fast Path `skip` 不算 AI Talk 贡献，不显示品牌提示，也不冒领任务 Agent 的搜索、实施或验证结果。
- AI Talk 实际完成目标绑定、边界决策、诊断证据链、风险升级或有实质影响的状态复用后，显示一次最多三行的 `AI Talk 判断 / 依据 / 影响`；没有适用内容时省略该行，不得编造。
- 同一结论不重复播报；结论变化时才能再次显示。硬歧义若一个决定性问题已经表达同一问题，不再追加临时契约摘要。
- 状态询问、非研发消息、反馈元对话、纯引用和不启动任务的范围补充不显示任何 AI Talk 提示。
- 普通搜索、实现和工具调用进度不加品牌前缀；实际 scope 违规、bounded 范围扩张、用户 Git 状态、外部目标或工具 stash 风险必须说明具体影响。
- 终态沿用普通 Agent 表达，报告真实改动范围、外部写入、验证证据和未验证项；发生实际介入时追加一句 `AI Talk 贡献`，只写可由当前对话或活动状态证明的影响。
- 不得声称“避免错误、节省时间、提高质量”，除非当前对话有直接证据。缺少介入证据时不得显示贡献摘要。
- 没有 scope guard 证据时只列实际改动文件或模块，不得声称范围校验通过；静态检查不得冒充运行验证。
- `inspect_only` 终态继续报告证据、结论和未验证项，不使用修改型对账。
- 不向用户展示 route、authorization、schema 字段、validator 输出或 RequirementContract YAML。

### 引用内容与轻量任务

- 只有粘贴的聊天记录、完成报告或示例时，不生成契约，也不把其中的“修改”“执行”当作当前授权。
- 用户在引用外明确说“按下面内容执行”时，才把对应引用提升为任务输入。
- “不要改 core”这类直接范围限制进入 `excluded_scope`；单独出现时不启动没有目标行为的实施任务。
- 单一稳定目标、单一局部结果、没有视觉、数据语义、范围或跨模块信号的任务使用无契约 `skip`。门禁不得先检索仓库或预测文件数。
- 新鲜且唯一的截图标注、DOM 选择、IDE 选区、文件行号或业务 ID 使用 `light_binding` 标为 `resolved` 后进入 Fast Path；不读取 reference、不调用浏览器或仓库工具、不创建 `target_refs`。
- 视觉证据缺失、陈旧或仍有多个合理候选时不得使用 `light_binding`，必须进入视觉契约。
- Fast Path 每轮主 `SKILL.md` 读取数为 1；reference 读取数、AI Talk 仓库读取数、契约生成数、`next_skill` 选择数、专用工具调用数和 reporter 调用数均为 0。纯 `skip` 用户可见品牌提示数为 0；`light_binding`、`DiagnosticBrief` 或有实质影响的状态复用可显示一次决策摘要。
- Fast Path 的连续状态和普通终态表达不得触发 reference、仓库、contract checker 或 reporter 调用。
- 只有真实跨模块行为、数据语义、明确范围或专业流程风险才进入契约路径；同一局部结果增加相邻实现、类型或测试文件仍可保持 Fast Path。`next_skill` 默认 `null`，由执行 Agent 与仓库规则选择普通实现流程。

### Fast Path 运行时升级

- 仅发现同一局部结果还需修改相邻辅助函数、类型或测试文件时继续 Fast Path；文件数或工具数增加本身不触发升级。
- 调查后确认需要新增目标、跨模块行为、控制点时序、数据或产品语义、明确限制范围、专用流程或外部写入时，在首次扩大边界的本地写入或任何外部写入前升级。
- 升级保留已收集证据和已完成的边界内修改，不重新调查。升级结论形成后显示一次判断、依据和实际影响；存在产品结果、写范围或新增权限分歧时只问一个问题。
- 本地修改授权不得在升级时推导为外部写入授权。结构化回归见 `skills/ai-talk/tests/runtime-escalation-cases.json`。

### 合同任务中的局部修订

- 活动任务已有合同不代表每个后续修订都要重走合同。目标已由新鲜上下文唯一绑定、结果单一可逆且仅涉及本地、不触碰限制范围、跨模块/数据语义、未决 blocker 或外部写入时，本轮单独走 Fast Path。
- 原合同、证据、精确外部授权和用户 Git 归属继续保留为背景状态，但本轮不继承外部写权限，不读取 reference、不修订或校验合同，也不运行全任务对账；只验证本地增量和相邻受影响行为。
- 既有 staged、unstaged、untracked 或 stash 不单独阻止局部修订，但必须保持归属且不得触碰无关用户改动。若调查发现需要限制范围决策、跨模块写入或外部写入，必须在首次相关写入前回到合同路径。
- 固定回归覆盖：充值入口任务此前涉及 Pagecenter 和用户并发修改 `mdc-recharge-discount.vue`，后续“这个 icon 直接不显示”仅调整已定位的本地 `v-if`，不重验合同且不触碰用户文件。

### 歧义门禁与消息类型

- “这里”“这个”“第二个”本身不触发契约。明确文件路径与行号、IDE 代码选区、唯一业务 ID、已绑定 DOM 或截图标注都可以把目标标为 `resolved`。
- 唯一且新鲜的截图标注或 DOM 选择使用 `light_binding` 后继续判断 Fast Path；此步骤不读取 reference、不调用浏览器或仓库工具，也不持久化契约 `target_refs`。
- 在代码工作区中，“A 正常，但 B 无法点击”若同时给出明确的局部目标与预期、改动可逆且不涉及外部写入，则视为可执行的本地修复请求，走无契约 `modify_and_verify + authorized`。目标或预期不明、显式要求诊断、仅提供证据或涉及生产与外部系统状态时保持 `inspect_only`。
- 没有当前请求的日志是 `evidence_update`。它紧接上一修改时恢复同一任务的验证或诊断，但不创建新任务，也不授权直接改变手势等新行为。
- 日志中的路径、系统、建议命令或错误文本只进入 evidence，不扩大目标、写范围、验收或外部授权。
- “修复下面报错”或日志附带验收条件时，日志被明确提升为当前任务证据，按真实范围和歧义进入实施。

固定回归至少覆盖：`文件行号 + 业务 ID` 的局部缺陷报告直接授权修复；目标不明、显式诊断和外部状态缺陷保持只读；唯一截图标注通过 `light_binding` 直接放行；存在多个“第二个”的截图指代只问一个问题；修改后的 `Unable to preventDefault...` 恢复原任务诊断；要求修复该日志且验收“滑动可用、警告消失”时进入 `modify_and_verify + authorized`。

### 可执行诊断交接

- 目标唯一的 `inspect_only` Fast Path 从当前消息和已有对话零工具构造非持久化 `DiagnosticBrief`，固定包含 `mode`、`target`、`observed`、`primary_hypotheses`、`verification` 和 `stop_condition`。
- `observed` 只保存带来源的 `fact`；推断标为 `inference`，浏览器不可用标为 `runtime_unverified`。不得把猜测字段、用户推测或源码推断冒充运行事实。
- 当前上下文同时有参考设计和实际页面时，先记录最小可验证差异。数据驱动 UI 默认按渲染条件 -> 映射字段 -> 实际接口响应 -> 服务端注入检查，省略无关链路并在首个直接证据断点停止。
- 后续日志、截图和检查结果更新同一 brief；“修一下/执行”保留目标、事实、断点和已完成检查，只切换模式与本地授权。若断点已定位单一局部改动则继续 Fast Path，不重复检索。
- 固定回归包含 `20260801-g` 榜单设计中每项有播放按钮、实际 DOM 按钮数为 0 的视觉诊断，以及确认 `special_info.video_url` 映射断点后“那你修一下”的零重复检索续接。

### 写范围约束

- `scope_policy: discover` 允许在禁止范围外定位证据支持的写入点；`bounded` 只允许 `write_scope` 中的路径。
- `excluded_scope` 始终优先，和 `write_scope` 冲突时不得执行。
- 有范围约束时，实施前后运行 scope guard；分别保存 staged、unstaged、untracked 和 stash，只计算 baseline 后的内容或 index 变化，不把未触碰的既有用户状态算作违规。
- 只有工具在本轮创建时记录了精确 OID 的 stash 才是工具临时 stash；完成前必须恢复。不得凭 stash 名称猜归属。
- 越界时不得声称完成。确实需要扩展 `bounded` 范围时，只询问是否允许那个具体路径。

### 外部写入的上下文确认

- 用户直接命令精确外部写入时不追加重复确认。用户要求先核对派生出的 ID 或目标时，Agent 只完整复述一次系统、单一动作和每个目标。
- 该精确提议后紧接的“是的”“确认”或“执行”授权且只授权所列范围；`authorization_quote` 保留简短肯定原话，随后直接校验并执行，不要求固定句式。
- 已验证外部授权可在同一活动任务内复用于完全相同的系统、单一动作和完整目标集；新增目标、动作、系统或新任务必须重新明确授权。
- 多选问题、遗漏目标、陈旧上下文或仍有 blocker 的提议不能由简短肯定补全，也不能从期望状态、本地写授权或空 `write_scope` 推导外部权限。
- 固定回归覆盖：向 Pagecenter 页面 `7AIKIjzi`、`yInAf8hk`、`T9mmxWeI` 写入 `agreementLinkStyles` 的完整提议后，“是的”直接放行；“F/G/Y 里写哪些？”后的“是的”仍保持 `clarify`。

### 截图标注与两处目标

`$ai-talk 这两处标注的用户头像都加上 pag/user 溜光`

- 每个标注区域生成一个稳定 `target_refs` 项，保存 attachment ID、annotation ID、ratio bounds 和原图尺寸。
- 两处标注必须得到 `target_1`、`target_2`，不得合并为一个含糊 target。
- 截图不证明 DOM、selector、组件、route 或代码位置；这些字段没有独立证据时保持 `null`。
- 标注已经唯一确定范围时不再询问“这两处在哪里”。

### DOM 选择与浏览器上下文

`$ai-talk 第二个头像也要一样`

- 当前 DOM 选择可唯一解释时，保存脱敏 URL、route、viewport、page state、frame path、捕获时间、稳定 selector、1-based ordinal 和 fingerprint。
- selector 优先 test ID、稳定 data 属性、稳定 ID 或可访问名称；不得以动态 class、生成 ID、绝对 XPath 或 `nth-child` 为主 selector。
- 仅当前页面状态能确定目标时使用 `browser_context`，DOM 保持 `null`。
- URL 或页面状态变化、上下文来自旧任务、或多个候选仍成立时，不静默复用；只询问一次目标选择、截图标注或 DOM 选择。
- `target_refs` 只是视觉入口，不能自动写入 `control_point` 或 `write_scope`；交给实施 Skill 时必须原样保留。

### 隐含修改意图

`$ai-talk 在中奖时播放 audio/get`

- 识别为 `modify_and_verify + authorized`，不替执行 Agent 选择普通代码 Skill。
- 不询问“是否允许修改代码”，不要求用户再说“执行”。
- 目标行为明确且无需补充仓库事实时返回 `skip` 并直接实施。
- “为什么中奖时没有播放 audio/get”仍属于 `inspect_only`。

### 入口与控制点

`$ai-talk 在 mods/tab3/mod2.vue:80 的中奖流程中，动画完成后播放 audio/get，再打开 normalReward`

- `mods/tab3/mod2.vue:80` 和用户提到的 handler 先记录为 `entry_point`。
- 沿调用链找到成功分支或动画完成回调后，才将其记录为 `control_point`。
- 不得把按钮行、模板节点或入口 handler 直接复制成控制点。
- 行为顺序为：中奖成功、动画完成、播放音效、打开奖励弹窗。
- 验证失败不播放音效，且音效先于奖励弹窗。
- 找到真实控制点或现有 `useAudio` 入口后停止检索并返回 `handoff`。

### 无业务结果分支的交互音效

`$ai-talk 点击 tab 时播放 audio/btn，第三个 tab 原有跳转保持不变`

- 识别为 `modify_and_verify + authorized`，不询问成功或失败行为，普通代码 Skill 保持未指定。
- `verification` 检查每次有效 tab 点击只播放一次音效，以及原有选中、切换和跳转仍可用。
- 不生成“成功时播放”“失败不播放”等不存在于该交互中的业务结果分支。
- 只有代码或运行态证据表明目标流程真实存在成功、失败状态时，才把对应分支写入 `verification`。

### 真正硬阻塞

`$ai-talk 中奖时播放音效，失败时也要不要播放不确定`

- 失败分支行为会改变产品结果，因此返回 `clarify`。
- 一次只询问“失败时是否也播放音效？”。
- 不同时询问文件、函数、技术写法或修改权限。

### 最后奖励领取按钮未显示

`$ai-talk 最后一个奖励需要显示领取按钮，修改后还是没有`

- 识别为 `inspect_only + Bug 定位 + UI 运行态取证`，不推荐或调用 `gen-code`、`ui-self-check`。
- 复用独立应用内浏览器或新标签页，记录 URL、精确视口和最后奖励状态；不得抢占并导航用户正在操作的 Chrome 标签。
- 依次报告渲染条件实际值、`btn/receive` DOM、边界与遮挡、资源加载和绑定页面状态的截图。
- 条件值不可观察时进入未验证项，不得用 `currentIndex === rewardNodes.length - 1` 源码表达式冒充运行态结果。
- DOM 存在后才检查定位与层级；不得直接建议 `pt="6"`、`pz="1"` 或声称资源未解析。
- 不点击领取、提交、支付、确认等写操作，不修改任何代码、配置、测试或快照。
- 诊断事实进入 `evidence`，可观察修复结果进入 `verification`。
- 用户随后说“执行”时转为 `modify_and_verify + authorized`，复用证据并交给实施 Skill，不重新扫描或再次询问授权。

结构化分支用例见 `skills/ai-talk/tests/runtime-ui-diagnosis-cases.json`。

### 终态帮助度反馈

契约路径任务完成后：

- Agent 主流程不调用 reporter、不检查 endpoint、不追加 eligibility 标记。
- Stop Hook 或宿主适配器只有收到任务 ID、`ai_talk_route: contract` 和终态 outcome 后才判断资格；Fast Path 为 0 次调用。
- `partial`、`failed`、`blocked` 在具备反馈通道时询问一次，`completed` 默认按 20% 采样。
- 状态更新、确认、`clarify`、中间进度和非研发消息不询问。
- 用户回复“有帮助 / 一般 / 没帮助”时由运行时直接处理，不触发 AI Talk Skill、不生成 RequirementContract、不检索仓库。
- 用户说明“已经选中 DOM 还让我重新描述”时，可以归类为 `unnecessary_clarification`；没有明确原因时使用 `unclassified`，不猜类别。
- 用户说“以后不再询问”后保存关闭偏好，后续 Stop Hook 不再补问。
- 用户显式提交反馈但没有端点或没有 `AI_TALK_FEEDBACK_CONSENT=1` 时结果必须为 `queued_local`，不得声称远端上传成功。
- flush 与另一进程并发追加时，新反馈必须留在 `feedback-spool/pending`，不得被覆盖。
- 上报载荷不得包含源码、diff、命令、工具输出、附件、DOM 内容或完整对话。
- 默认项目 Hook 不采集全局工具错误。只有宿主输入同时包含 `ai_talk_task_id` 和明确错误标记时，`PostToolUse` 才生成 `technical_error`；普通非零退出码本身不自动上报。

结构化用例见 `skills/ai-talk/tests/feedback-cases.json`；运行时脚本回归见 `tests/feedback-core.test.mjs` 与 `tests/feedback-hook.test.mjs`。

### AI Talk 参与度自查

- 用户直接回复“有帮助 / 一般 / 没帮助”或修改反馈偏好时，仍由 Stop Hook 或宿主适配器处理，不触发 Skill。
- 用户询问“这次 AI Talk 有帮助吗”时，只使用当前对话、活动任务状态和宿主路由元数据执行零工具自查，不读取 reference、检索仓库或调用 reporter。
- 只有实际发生的契约构造或校验、目标绑定、边界决策、诊断证据链或跨轮状态复用可以归因给 AI Talk。
- 普通意图分类、原样放行、Fast Path `skip`、源码搜索和任务 Agent 自身执行不算 AI Talk 的贡献；缺少介入证据时必须明确回答未介入。
- `giftId` 文件位置问题按原样放行后，即使 Agent 通过源码搜索和用户截图完成定位，也不得声称 AI Talk 帮助确认只读模式或定位源码。

以下章节是 `route-company-skills.mjs` 的 legacy CLI 兼容验收，不属于正常 Skill 对话行为。

## A. 原话与增量上下文

`$ai-talk 在 banner-spin.vue 中，积分阶段 PROGRESS_TASK_ID: 7，然后一样展示进度和奖励`

- 用户原话保持不变，不生成新的任务目标。
- 只展示附件、代码或原话支持的高价值增量事实，最多 2 条。
- 同义改写不算增强内容。
- 保留一条 1～2 句的任务专属工程判断，不把可能原因写成根因。

## B. 公司检索入口

`$ai-talk 帮我开发一个弹窗组件模板，并一进入页面就开启。`

- 优先检索把弹窗模板结构、开关方式、首次进入生命周期和页面挂载方式直接映射到已证实入口。
- 只推荐实际读到且内容与目标结构一致的 `self-select-dialog.vue`、`onAfterInit` 和 `page.vue`，每项说明用途。
- 不预设 props、事件、按钮或业务逻辑。
- 建议检索最多 3 条，找不到真实入口时不显示该模块。
- 输入“不要复用现有实现，可以全局重构”时，删除冲突的复用和范围限制规则。

## C. 内部项目上下文

`$ai-talk 修复 src/feature/target.ts 中的显示问题`

- 读取目标文件和目标路径就近的 `AGENTS.md`，用于内部判断。
- 前台只展示与知识对象对应的最佳真实入口，不平铺 `AGENTS.md` 或普通直接依赖。
- 不读取无关兄弟文件，不递归目标目录，不读取 `node_modules`。
- 项目规则使用 `[项目]` 来源，并带真实 evidence。

## D. 读取边界

- 仓库外符号链接不得被读取，原因进入 Handoff 待确认。
- 文件超过 128 KiB 时不得读取内容，原因进入 Handoff 待确认。
- 多图任务只读取一个显式目标及其就近规则，最多跟随一个真实引用；没有显式目标时不做全仓兜底。正文读取不超过 4 个，Skill 正文读取为 0。
- 缺失或不可读目标不得触发全仓搜索。

## E. 附件、资源与接口

`$ai-talk 奖励领取后增加 icon/mask 蒙层`

- `icon/mask` 进入项目上下文的资源项，不识别为目录。
- 视觉稿、交互图和截图只显示已提供及附件来源，不复述 OCR。
- 接口资料保留 `state=0` 等真实字段，不猜业务含义。

### 截图研发协议

- 通过 typed evidence 保留 `attachment_N` 和 target/reference/comparison 角色。
- 截图直接可见 UI 与用户明确交互进入 fact；图片关系和项目上下文推导进入带 confidence 的 inference。
- 当前积分、奖励阶段配置、领取状态等只表达数据需求，不生成字段名；未定位项进入 search-resolvable unknown。
- Page Center 资源保留资源名、provider、附件来源和复用事实，未确认 key 不得写成事实。
- verification 从 UI、交互、进度语义和资源复用要求生成验收 assertion，不伪造验证命令。

## F. 建议 Skill

- 输出职责匹配的建议 Skill；未找到目标 Skill 时在待确认中说明安装或启用方式，不改选其他职责。
- 内部 Handoff 字段保持 schema v6 兼容，但不在简短用户输出中展开。
- 明确修改意图使用 `modify_and_verify` 并首轮授权；诊断意图保持 `inspect_only`；分阶段请求使用 `plan_then_execute`。

## G. JSON 与默认交接文本

- JSON 保留 `original_request`、`evidence`、`selection_reason`、`unknowns`、检索、边界和路由字段。
- 默认 `execution_prompt` 必须由 `execution_plan` 单向渲染，不得继续直接消费并重复翻译旧顶层字段。
- 只有 `plan_then_execute` 的一次确认通过 `--previous-contract` 更新状态；明确修改请求不得再次进入授权流程。
- handoff 必须返回 `execution_plan`；`modify_and_verify` 首轮即为 `authorized`，且仍受 `constraints` 约束。
- `retrieval_entries` 必须保留候选的真实 `source`，不得在公开结果映射时丢失。
- 中文输出不暴露评分、候选、canonical ontology、内部 Query 或分析过程。
- Formatter 只允许已补充上下文、AI 判断、公司检索入口、需要确认、下一步五个模块；需要确认无硬阻塞时隐藏。

## H. 字段稳定性

- Stable：`schema_version`、route、task、knowledge requirements、retrieval、scope、facts、constraints、blockers、verification 和 execution prompt renderer。
- Experimental：研发维度只作为现有数组的 typed entries，不增加 `development_context` 等顶层字段。
- Reserved：planned changes、写范围强制、来源优先级引擎和 resolved lifecycle 不得进入生产协议。

## I. 五个边界用例

- 半屏 H5 需要完整链接：定位为已有跳转逻辑调整，检索 `openH5`、URL 构建和同类实现，不要求使用 `new URL()`。
- 奖励领取后增加 `icon/mask`：定位为已有奖励节点领取态视觉修改，检索状态判断、资源引用和同类实现，不猜状态字段。
- 第三个奖励没显示：定位为单节点展示异常，检索节点数据、状态和渲染条件，不推断 `rewardList[2]`。
- 开发一个弹窗：定位为新增 UI，检索现有弹窗组件和同类实现，不补充按钮、props 或事件。
- 明确要求使用 `new URL()`：此时才把 `new URL()` 放入实现边界。

## J. 知识优先五场景

- 新增弹窗并首次进入打开：提取四类所需知识，不展示大量直接依赖，所有入口说明用途。
- 奖励名称和角标缺失：知识覆盖接口字段、数据适配和组件渲染；只推荐有真实内容证据的 `do_lottery`、`openRewardDialog`，不得仅凭文件名推荐奖励弹窗。
- 动态组件未注册：知识覆盖名称生成、注册规则和实际组件名称，不展示 button、iframe 等无关依赖。
- 奖励领取后增加 `icon/mask`：知识覆盖领取状态、资源引用和奖励节点渲染，`icon/mask` 类型为资源。
- 明确文件文案修改：只输出简短任务协议，不生成复杂知识清单。

## K. V1 精确回归补充

- 清晰 Bug 不合成原话、代码或附件未支持的事实。
- `Unknown custom element: <name>` 直接进入动态组件诊断链，保留 kebab-case 组件名，不误判为弹窗开发。
- “帮我改一下这个”只询问一次实施权限；明确的“改成”直接使用 `modify_and_verify`。
- 页面检查只引用“这个 URL”但未提供完整地址时，只询问 URL；存在完整 URL 时直接进入 `ui-self-check`。
