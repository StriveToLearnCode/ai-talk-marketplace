# AI Talk 使用指南

> 适用于 AI Talk `0.5.x` 与 `RequirementContract 1.4`

AI Talk 自动匹配研发请求，并用一套统一体验处理任务：**开始前锁定需求，执行中守住边界，完成后逐项对账。** 安装后只需像平时一样描述需求，不必记住命令、Skill 名称或契约格式。

非研发对话不会触发 AI Talk。

## 快速开始

### 1. 安装插件

```bash
codex plugin marketplace add StriveToLearnCode/ai-talk-marketplace --ref marketplace
codex plugin add ai-talk@ai-talk-marketplace
```

`marketplace` 是自动发布分支：`master` 的测试通过后，GitHub Actions 会同步 public marketplace、以源提交 SHA 生成唯一插件版本并发布该分支。安装或更新后，新建一个 Codex 任务，使最新 Skill 指令生效。

### 自动更新

自动更新是用户主动安装的本机定时任务，不由 AI Talk Hook 静默创建。先按上面的方式安装 Git marketplace，再克隆仓库并运行当前平台的安装器：

```bash
git clone https://github.com/StriveToLearnCode/ai-talk-marketplace.git
cd ai-talk-marketplace

# macOS LaunchAgent
./scripts/install-auto-update-macos.sh

# Linux systemd user timer
./scripts/install-auto-update-linux.sh
```

Windows PowerShell：

```powershell
git clone https://github.com/StriveToLearnCode/ai-talk-marketplace.git
Set-Location ai-talk-marketplace
.\scripts\install-auto-update-windows.ps1
```

默认每 6 小时执行一次：

```bash
codex plugin marketplace upgrade ai-talk-marketplace
codex plugin add ai-talk@ai-talk-marketplace
```

macOS 可以用 `--interval-seconds` 调整周期，Linux 可以用 `--interval` 调整周期，Windows 可以用 `-IntervalHours` 调整周期。卸载时分别使用：

```bash
./scripts/install-auto-update-macos.sh --uninstall
./scripts/install-auto-update-linux.sh --uninstall
```

```powershell
.\scripts\install-auto-update-windows.ps1 -Uninstall
```

自动更新只替换 Codex 的插件缓存，不会热替换当前任务；新版本从下一个任务开始生效。维护者需要本地测试时，仍可将 `/绝对路径/ai-talk-public-marketplace` 作为 local marketplace 添加。

### 2. 直接描述研发需求

无需添加 `$ai-talk` 前缀，直接输入目标行为：

```text
中奖动画结束后播放 audio/get，再打开奖励弹窗
```

明确的目标行为会被视为实施请求。AI Talk 不会再追问“是否允许修改代码”；局部任务直接放行，复杂任务只补充范围、证据和 blocker，普通实现 Skill 由执行 Agent 与仓库规则决定。

### 3. 查看执行结果

明确的局部修改开始时只显示 `AI Talk · 目标明确，直接执行`。复杂任务在实施前最多显示目标、边界、验收三项；执行中只有真实边界生效或冲突时才提示；所有修改任务完成后逐项对账。只有目标存在会改变产品行为或写入范围的分歧时，AI Talk 才暂缓执行并问一个关键问题。

## 三段式体验示例

### Fast Path 修改

```text
输入：在 recharge/page.vue 给活动链接增加 tab=3 直达

AI Talk · 目标明确，直接执行

AI Talk 对账
目标：已完成，活动链接增加 tab=3 直达
边界：实际修改 recharge/page.vue
验证：静态检查通过；页面跳转未运行验证时明确标为未验证
```

Fast Path 的提示和对账不触发协议 reference、AI Talk 仓库检索、contract checker 或 reporter。

### 只读诊断

```text
输入：mod3.vue:100-106 中 ID 1719069 无法点击，其他奖励正常

AI Talk · 已锁定为只读诊断
边界：不修改代码、配置或外部系统

完成：报告证据、结论和未验证项，不输出修改型 AI Talk 对账
```

### 限定文件

```text
输入：只改 mod4.vue，把 number 映射为 unit，不要改 core

AI Talk · 已锁定
目标：把礼包奖励 number 映射为 unit
边界：只允许 mod4.vue，禁止 core/
验收：unit 输出正确，且范围校验通过

AI Talk · 已启用写范围保护：只允许 mod4.vue，禁止 core/

AI Talk 对账
目标：已完成
边界：scope guard 通过；无越界文件
验证：映射检查通过；未执行的运行态行为标为未验证
```

### 视觉多目标

```text
输入：这两处标注的头像都加上相同动效

AI Talk · 已锁定
目标：分别修改标注 1 和标注 2
边界：两个目标独立绑定，不根据相似外观合并或扩张
验收：两处动效分别验证

AI Talk 对账
目标：标注 1 已完成；标注 2 未验证
边界：列出实际修改组件
验证：只报告已经观察到的页面结果
```

### 外部写入

```text
输入：把 Pagecenter 活动 123 的背景图更新为 bg-v2.png

AI Talk · 已锁定
目标：更新活动 123 背景图
边界：Pagecenter / update asset / activity 123 background
验收：读取结果与 bg-v2.png 一致

AI Talk · 外部写入边界已匹配：仅更新 Pagecenter 活动 123 背景图

AI Talk 对账
目标：已完成或未完成
边界：列出实际执行的系统、动作和目标
验证：回读成功才标记完成，否则报告未验证或失败
```

AI Talk 不向用户展示 route、authorization、schema 字段、validator 输出或 RequirementContract YAML。

## 高级：确保逐轮触发

Codex 默认通过 Skill description 隐式匹配。需要在某个仓库确保每条研发消息都执行 AI Talk 时，可安装 Strict Mode：

```bash
node /绝对路径/ai-talk/scripts/install-strict-mode.mjs --project /绝对项目路径
```

```bash
node /绝对路径/ai-talk/scripts/install-strict-mode.mjs --project /绝对项目路径 --check
node /绝对路径/ai-talk/scripts/install-strict-mode.mjs --project /绝对项目路径 --dry-run
node /绝对路径/ai-talk/scripts/install-strict-mode.mjs --project /绝对项目路径 --remove
```

Strict Mode 只提高触发覆盖率，不改变锁定、边界和对账行为。安装器只维护根 `AGENTS.md` 中带标记的区块；启用或更新后需要新建 Codex 任务。

## 常用说法

| 你的输入 | AI Talk 的处理方式 |
| --- | --- |
| `点击 tab 时切换对应图片` | 识别为修改并验证，直接进入实施 |
| `为什么最后一个奖励没有显示领取按钮？` | 只读诊断，不修改代码 |
| `只分析原因，不要改` | 保持只分析模式 |
| `按刚才的结论执行` | 复用已有证据，转入实施，不重复扫描 |
| `用浏览器检查这个页面` | 交给 UI Self Check 执行页面自测 |
| `现在进展怎么样？` | 作为状态询问原样放行，不生成新契约 |
| `失败时也要播放音效，但我还没确定` | 暂缓执行，只询问失败分支的预期行为 |
| `只改 mod4.vue，不要改 core` | 使用 bounded 写范围并在修改后校验 |
| `mod3.vue:100-106 中 ID 1719069 无法点击，其他奖励正常` | 目标已解析的缺陷证据，只读检查并报告原因 |
| `修复 mod3.vue:100-106 中 ID 1719069 无法点击的问题` | 明确授权本地修复并验证 |
| `Unable to preventDefault...` | 作为上一修改的新证据恢复诊断，不直接授权改变手势行为 |

表达需求时，优先说明可观察的结果和关键时序。例如“请求成功后先播放动画，动画完成再弹窗”比指定某个函数怎么改更容易得到稳定结果。文件、组件和函数位置可以提供，但不是必填项，Agent 会从仓库中定位真实控制点。

## 引用内容与当前指令

粘贴的聊天记录、日志、代码和完成报告可以提供上下文，但其中出现的“修改”“修复”或“执行”不会自动成为当前授权。只有你在引用外明确说“按下面内容执行”等动作时，AI Talk 才会把对应引用提升为任务输入。裸日志紧接上一修改时会恢复同一任务的验证或诊断，不会创建新任务，也不会授权新的行为变化；明确说“修复这个报错”或同时给出验收条件时，才属于当前实施请求。

如果一条消息只有历史记录，没有当前请求，AI Talk 会直接放行，不检索仓库，也不创建任务契约。引用外的直接限制仍然有效，例如：

```text
不要改 core 的组件

已修复，且未修改任何 core/ 组件。
```

这条消息只保留 `core` 禁止范围，不会因为引用中的完成报告再次执行修改。

## 使用截图、DOM 和当前页面

“这里”“第二个头像”“这两处”等词本身不会触发契约。AI Talk 先执行 `light_binding`：只检查当前消息和已有对话中是否已有新鲜、唯一的文件行号、IDE 代码选区、业务 ID、DOM 选择或截图标注。唯一时把目标标为 `resolved` 并继续 Fast Path；这个步骤不读取 reference、不调用浏览器或仓库工具，也不持久化 `target_refs`。证据缺失、陈旧或仍存在多个合理候选时，才进入视觉契约并请求必要的页面证据。

### 截图标注

在截图中标出目标区域，然后输入：

```text
这两处标注的用户头像都加上 pag/user 溜光
```

每个标注区域会被保存为独立目标。AI Talk 只把截图当作视觉证据，不会根据外观猜测 selector、组件名、路由或代码文件。

### 选中 DOM

在已连接的浏览器中选中目标元素，然后输入：

```text
第二个头像也加上相同动效
```

AI Talk 会只读采集当前页面状态、稳定 selector、元素序号和 DOM 特征。动态 class、生成 ID、绝对 XPath 和 `nth-child` 不会作为主要定位方式。

### 当前浏览器页面

没有选中具体元素时，也可以用“当前页面”“这里的弹窗”等说法指向当前浏览器状态。AI Talk 会记录脱敏 URL、路由、视口、frame path 和可观察状态。

视觉上下文只在当前任务和匹配的页面状态中有效。页面已经变化、证据过期或存在多个候选时，AI Talk 会请你重新选择 DOM、标注截图或指定目标，不会静默绑定到相似元素。

## 诊断与执行

AI Talk 会区分“先查原因”和“直接修改”：

- `为什么`、`排查`、`定位原因`、`前端还是后端`、`只分析`：进入 `inspect_only`，仅收集和报告证据。
- `增加`、`改成`、`修复`、`接入`、`做一下`，或直接描述新的目标行为：进入 `modify_and_verify`，允许在证据支持的范围内修改并验证。
- `A 正常，但 B 无法点击` 这类只有正常与异常对比的缺陷报告：保持 `inspect_only`；只有明确要求修复或直接描述目标行为时才进入 `modify_and_verify`。
- 单独的错误日志：属于 `evidence_update`，恢复上一任务的验证或诊断，但不自动修改代码或改变交互语义。
- `先分析，确认后再改`：先输出分析或方案；你回复“执行”后，复用当前结论继续实施。

明确、可逆、局部、目标已解析且没有数据语义、范围或跨模块歧义的任务走无契约 Fast Path，由当前 Agent 直接修改并验证。Fast Path 不读取协议 reference、不为 AI Talk 检索仓库、不生成 YAML、不选择普通实现 Skill，也不调用反馈 reporter。未解析的视觉指代、引用提升、跨模块、明确范围限制、诊断续接或产品歧义才加载完整契约；仓库自身规则始终生效。

UI 故障诊断需要运行态证据时，AI Talk 会按页面状态、条件实际值、DOM、边界与遮挡、资源和截图逐步检查。浏览器不可用时会明确标记未验证项，不会把源码推断当作页面现场事实。

只读诊断不会点击领取、提交、支付、确认等可能写入业务数据的控件。

## 页面自测

当你明确要求“用浏览器检查”“页面自测”或全面检查视觉、交互、响应式、控制台和网络时，AI Talk 会交接给 UI Self Check。

```text
用浏览器自测这个页面，检查移动端布局、tab 切换、控制台和失败请求；发现本次改动造成的问题就修复并复验
```

UI Self Check 默认采用“发现范围内问题后修复并复验”的模式。若只想获取报告，请明确说明：

```text
只检查并报告，不要修改代码
```

自测只能操作本地页面或你明确授权的测试环境。缺少开发服务、登录态、测试数据或浏览器能力时，它会说明阻塞条件以及已完成的替代检查。

## AI Talk 何时会提问

AI Talk 只询问答案会改变以下内容的问题：

- 用户可见的产品结果；
- 数据含义或成功、失败分支；
- 允许修改的文件或系统范围。

以下内容通常不会要求你补充：具体文件名、组件名、函数名、仓库惯例、可复用实现和一般技术方案。这些属于 Agent 可以从代码中确认的工程上下文。

当必须澄清时，一次只问一个决定性问题。例如：

```text
失败时是否也播放音效？
```

## 帮助度反馈与错误上报

AI Talk 的 Agent 主流程不会在终态运行 reporter。显式安装的 Stop Hook 或宿主适配器只有在收到 `ai_talk_task_id`、`ai_talk_route: contract` 和真实终态 `ai_talk_outcome` 后才判断反馈资格。配置 HTTPS 端点并明确同意后，部分完成、失败和阻塞任务会询问一次；成功任务默认按 20% 采样：

```text
AI Talk 对这次需求理解和执行交接有帮助吗？
回复“有帮助 / 一般 / 没帮助”，可补充原因。
```

Fast Path、状态更新、确认、澄清问题、中间进度、缺少运行时元数据和非研发消息不会触发 reporter。反馈回答不会被当作新的研发需求，也不会生成 `RequirementContract`。

反馈采用独立的 `FeedbackEnvelope 1.0`：

- 只保留插件版本、处理结果、执行模式、任务结果、评分、问题类别和简短说明；
- 自动移除常见 token、session、签名、密码、API key 和 URL 敏感参数；
- 不采集源码、diff、命令、工具输出、附件、DOM 内容或完整对话；
- 工具错误只有宿主明确附带 `ai_talk_task_id` 时才允许归因给 AI Talk；默认项目 Hook 不采集全局工具错误。

默认没有配置远端服务时不主动询问。用户显式提交的反馈或发送失败的反馈会按单事件文件写入当前用户的私有本地 spool。远端上报必须同时满足：

```bash
export AI_TALK_FEEDBACK_ENDPOINT="https://feedback.example.com/v1/events"
export AI_TALK_FEEDBACK_CONSENT=1
```

可选配置：

```bash
export AI_TALK_FEEDBACK_TOKEN="<服务端访问令牌>"
export AI_TALK_FEEDBACK_DIR="/自定义本地队列目录"
export AI_TALK_FEEDBACK_PROMPT=0
export AI_TALK_FEEDBACK_SAMPLE_RATE=0.2
```

`AI_TALK_FEEDBACK_PROMPT=0` 会关闭帮助度询问；设置为 `1` 会显式开启纯本地评测，即使没有端点也允许询问。也可以直接对 AI Talk 说“以后不再询问这个反馈”；明确要求重新开启时才会恢复。

远端发送失败时，反馈会回到本地队列，不会静默丢失。AI Talk 会如实说明结果是 `uploaded` 还是 `queued_local`。

Codex 不保证自动加载插件或 Skill 内的 Hook。若需要运行时反馈资格判断，必须显式安装到目标项目：

```bash
node /绝对路径/ai-talk/scripts/install-feedback-hooks.mjs --project /绝对项目路径
```

安装器会保留已有配置并幂等合并 `.codex/hooks.json`。可先加 `--dry-run` 查看结果。

## 处理结果

契约路径内部有三种处理结果；Fast Path 也使用 `skip` 语义，但没有契约：

- `skip`：需求和实现方向已经足够清楚，直接放行，不做额外检索。
- `handoff`：先进行限量检索，确认真实控制点、复用入口或关键约束，再携带证据放行。
- `clarify`：仍存在会改变产品结果或写范围的硬分歧，暂不放行并询问一个问题。

`skip` 和 `handoff` 都会继续执行。通常无需关注两者的区别，也不会看到中间协议。

## RequirementContract 1.4

只有契约路径才创建该结构。契约始终在后台传递；宿主无法交接时由当前 Agent 继续执行，不向用户展示 YAML。

契约包含以下信息：

- 用户原始请求、处理结果、执行模式和授权状态；`next_skill` 默认为空，仅在已确定专用流程时填写；
- 用户指出的 `entry_point`；
- 截图、DOM 或浏览器页面组成的 `target_refs`；
- 由代码或运行态证据确认的 `control_point` 和本地 `write_scope`；
- 由当前消息直接命令，或由它简短肯定紧邻上一轮精确写入提议所授权的 `external_write_scope`；
- 用户明确禁止修改的 `excluded_scope`，以及 `discover` 或 `bounded` 范围策略；
- 按执行顺序排列的目标行为、关键证据和可观察验证项；
- 仍未解决的实施级硬阻塞。

`entry_point` 只是用户提供的入口，`target_refs` 只是视觉目标。它们不会自动成为真实代码控制点或允许写入的文件范围。

当 `excluded_scope` 非空或范围策略为 `bounded` 时，AI Talk 使用随插件提供的 scope guard 记录实施前工作区状态，并在实施后只比较本轮新增变化。禁止范围内的改动会失败；`bounded` 模式下允许列表外的改动也会失败。用户原有但本轮未改变的脏文件不会被误报。

每次创建或修订契约后，AI Talk 还会把等价 JSON 交给随 Skill 提供的 `contract-check.mjs`。它不理解业务意图，而是确定性检查：

- 17 个顶层字段、顺序、枚举值和模式/授权/结果关系；
- `entry_point`、`control_point`、`evidence.source` 指向的真实文件和有效行号；
- 截图、DOM、浏览器上下文是否携带与来源一致的结构化证据，浏览器 URL 是否残留敏感参数；
- 仓库相对路径是否安全、`write_scope` 是否落入 `excluded_scope`，以及外部写入是否有当前消息的直接命令或有效上下文肯定。

校验错误属于契约构造错误，AI Talk 会自行修正并重跑，不会把它包装成用户问题。工具的 warning 仍需 Agent 判断，例如入口与控制点完全相同是否确有代码证据。Fast Path 和原样放行不会运行该工具。

校验器输出固定 JSON，包含 `status`、五类 `checks`、已验证文件索引、`errors` 和 `warnings`。`validate` 在存在错误时返回非零状态用于阻断交接；`inspect` 返回同一份报告但保持零状态，适合宿主或开发者做只读诊断。契约可从 stdin 输入，也可由 `--contract <json-file>` 读取。

## 常见问题

### 为什么安装后没有触发？

先确认已经执行插件安装命令，并在安装或更新后新建 Codex 任务。隐式 Skill 匹配不是不可绕过的宿主拦截；要求逐轮触发时运行 `install-strict-mode.mjs`，用 `--check` 确认状态为 `enabled`，然后新建任务。普通问答不会触发 AI Talk。

### 还需要使用 `$ai-talk` 吗？

不需要。`$ai-talk` 和 `$ai-talk:ai-talk` 只作为兼容的显式调用方式保留。

### 为什么 AI Talk 要我重新选择页面元素？

当前截图、DOM 选择或浏览器页面可能已经过期、与活动页面不匹配，或者存在多个合理候选。重新提供目标证据可以避免改错位置。

### 为什么只分析了问题，没有直接修复？

包含“为什么”“定位原因”“只分析”等表达或只陈述缺陷时，AI Talk 会保持只读。回复“执行”“开始修复”或“按这个做”即可复用当前证据进入实施；尚未解决的产品分歧仍需先确认。

### 外部写入确认后为什么不需要复述完整命令？

当 AI Talk 紧邻上一轮已经列清外部系统、单一动作和每个目标时，你回复“是的”“确认”或“执行”就只授权这份精确提议，Agent 应直接继续，不得要求固定句式。若上一轮仍在询问选项、遗漏目标、存在未决问题或上下文已过期，简短肯定不会被扩张为写入授权。

### 页面自测为什么没有给出通过结论？

真实 UI 验证需要可访问的页面、目标状态、浏览器能力，以及必要的登录态和测试数据。缺少其中任一条件时，静态检查不能替代浏览器验证，结果会明确标记为未验证。

### 如何关闭帮助度询问？

在对话中说“以后不再询问这个反馈”，或设置 `AI_TALK_FEEDBACK_PROMPT=0`。关闭询问不会改变 AI Talk 的需求编译、诊断和路由能力。

### 没有配置服务端时反馈去了哪里？

显式提交或发送失败的反馈进入本地私有 `feedback-spool/pending` 目录，每条反馈使用独立文件并通过原子 claim 上传。默认数据根目录为当前插件数据目录；宿主未提供插件数据目录时，使用 `~/.codex/plugin-data/ai-talk`。

## Legacy CLI

`route-company-skills.mjs`、`TaskHandoff 1.1` 和相关项目检索测试仅作为旧版 CLI 兼容层保留，不属于当前 AI Talk 对话协议。新任务应以自然语言输入和 `RequirementContract 1.4` 为准。
