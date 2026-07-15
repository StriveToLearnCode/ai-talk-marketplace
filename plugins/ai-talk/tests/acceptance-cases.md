# AI Talk 证据化提示词模式验收

每个用例在刷新 cachebuster、重新安装插件后的全新 Codex 对话中运行。记录耗时、命令、文件读取、Skill 调用和最终输出。

## 1. 明确机械修改

```text
$ai-talk:ai-talk 修改 apps/page.vue，把错误的 Pug 风格组件调用改成合法 Vue HTML 标签，保留业务逻辑。
```

通过条件：读取明确指定的 `apps/page.vue` 一次且不超过 64KB；不读取依赖或同目录文件；零 Skill 调用；15 秒内输出结合文件现状的提示词并停止。任务已经足够明确时不强制输出空的对应关系或建议段。

## 2. 新增局部功能

```text
$ai-talk:ai-talk 这部分需要奖励预览。目标文件是 pages-O/recharge/mods/tab2/mod1.vue，点击不同奖励时预览当前奖励，不修改无关代码。
```

通过条件：读取目标文件一次且不超过 64KB，只运行一次 Skill-only 索引；`gen-code` 为首位候选；不读取 imports、同目录文件或 `gen-code/SKILL.md` 正文。首屏使用“目标”“事实”“自动补充”，事实只描述用户原话和已读取文件结构；自动补充使用“执行时”表述并以 `GenCode Skill` 等不带 `$` 的人类可读名称展示。将用户的“点击不同奖励”对应为奖励项是交互来源、当前奖励是预览目标；默认折叠的最终 `text` 代码块包含该对应关系、文件现状、`$gen-code`、真实路径、`local-patch + incremental` 和目标范围。用户未明确要求 UI 自测，因此不得出现 `$ai-talk:ui-self-check`、Playwright MCP 或浏览器启动步骤。

## 3. 功能与测试组合

```text
$ai-talk:ai-talk 结合联调文档、Figma 和现有 mod2.vue 完成 recharge Tab2 的功能与测试。联调文档和 Figma 链接已提供，只处理 mod2 及必要测试接线。
```

通过条件：

- 只运行一次 `.agents/skills` frontmatter 索引，总耗时 15 秒内。
- 有界读取用户明确提供的本地 `mod2.vue` 和本地联调文档，每个最多一次、最多 64KB；不打开 Figma URL，不读取项目规则、imports、候选 Skill 正文或 reference。
- 不调用 Chrome、浏览器、飞书、Figma、Agent、MCP 或任何下游 Skill。
- 最终 `text` 代码块先安排 `$gen-code` 使用 `local-patch + incremental` 完成功能，再安排 `$ai-test` 处理目标范围测试，最后进行 PageCenter 配置闭环和结果报告；Figma 链接和 UI 功能本身不得触发 `$ai-talk:ui-self-check`。
- `$gen-code` 和 `$ai-test` 只出现在待复制提示词中；输出后立即停止。

## 4. 显式 Skill 名称不触发执行

```text
$ai-talk:ai-talk 使用 $ai-test 帮我整理 recharge 页面测试任务，只输出优化后的提示词。
```

通过条件：不得把 `$ai-test` 视为当前轮执行授权；不得读取 `ai-test/SKILL.md`、检查 `figma-context.json`、调用 `gen-ai-test-context` 或运行测试；只把 `$ai-test` 写入最终 `text` 代码块。

## 5. 读取数量上限

同时附带 `one.vue`、`two.ts`、`three.yaml` 和 `four.md`。

通过条件：按输入顺序只读取前三个文件，每个最多一次、最多 64KB；不读取 `four.md`，在最终提示词中要求后续 Codex 读取它。

## 6. 不跟踪依赖

附带的 `mod3.vue` 中包含 imports、组件引用和配置引用。

通过条件：只读取 `mod3.vue`，不读取任何 import、同目录组件、`AGENTS.md`、`package.json`、项目配置或 Git 状态；不得使用 `rg`、`find`、Glob 或目录列表。

## 7. 外部资料只作为后续输入

```text
$ai-talk:ai-talk 根据这个飞书联调文档和 Figma 链接整理实现提示词。
```

通过条件：不打开链接、不读取 Chrome skill、不访问网络；若同时提供本地 `openapi.yaml`，只读取该本地文件；提示词要求后续 Codex 在执行阶段访问链接。

## 8. Bug 分析

```text
$ai-talk:ai-talk 轮播图偶尔不切换，只整理定位提示词，不修改代码。
```

通过条件：走 `direct + analyze`；零命令、零文件读取；不调用调试 Skill；不把猜测写成根因。

## 9. 简单 review

```text
$ai-talk:ai-talk 审查 src/utils/reward.ts 最近的改动，重点看行为回归和缺失测试，只生成 review 提示词。
```

通过条件：走 `direct + review`；有界读取明确目标文件，但不读取依赖或执行审查；最终提示词保留文件现状、范围、关注点和只审查边界。

## 10. Skill-only 无结果

让 `.agents/skills` 不存在或没有匹配 frontmatter。

通过条件：说明没有发现适用项目 Skill，但仍输出最小提示词；不运行 `collect_context.py`、完整索引、项目搜索或浏览器，不读取任何未明确提供的业务文件。

## 11. 输出契约

任意 ready 任务首屏都必须按顺序输出“目标”“事实”“自动补充”：事实最多 3 条且只来自直接证据，自动补充最多 3 条、每条以“执行时”开头，不得用“已读取”“已检查”“已验证”暗示当前轮访问了 `AGENTS.md`、Skill 正文或项目规范。带 `$` 的 Skill 调用语法不得出现在首屏。

随后输出一个不带 `open` 属性的 `<details>`，`<summary>` 固定为“查看完整 Prompt”，内部有且仅有一个自包含的 fenced `text` 代码块。代码块必须完全位于折叠区内，展开后可复制，并在其后输出：

```text
任务话术已生成，当前尚未执行代码修改。
```

普通任务的完整 Prompt 默认不超过 12 行、约 500 个中文字符；多个目标文件或真实歧义无法压缩时最多 18 行、约 800 个中文字符。绝对路径和 URL 各只出现一次且不计入字符预算。同一事实不得重复改写，不得输出固定“执行：”“交付：”、通用“约束：”或“工程实现约束”段落。代码块后不得继续读取、调用或执行，不得显示确认、取消或开始按钮。

## 12. 七行进度条目标文件

附带一个 7 行的 `mod3.vue`，内容只有现有容器、注释或空模板，并输入：

```text
$ai-talk:ai-talk 写进度条模板
```

通过条件：只读取 `mod3.vue` 一次；首屏“事实”准确描述当前容器、空模板或标签风格；折叠的最终提示词明确进度条模板的插入范围并保留现有结构；不读取任何依赖，不调用 Skill，不修改文件。

## 13. PageCenter 配置闭环

```text
$ai-talk:ai-talk 修改 pages-O/recharge/mods/tab2/mod1.vue，新增通过 $tf() 获取的标题文案，并读取 JSON 配置控制奖励预览。
```

通过条件：AI Talk 不搜索业务依赖、不生成具体 PageCenter key、不调用 `gen-page-center-config` 或 PageCenter MCP；最终 `text` 代码块要求后续 Codex 在完成代码和验证后闭环 PageCenter 依赖，并在最终报告中输出“外部操作：PageCenter”及“已完成”“需要用户手动操作”或“无需配置”状态。具备 PageCenter Skill、MCP、项目脚本、账号和权限时必须实际配置并验证；无法代操作或写入失败时，必须说明具体原因，并按 `text`、`json`、`assets`、`components`、`props` tab 给出用户可直接照做的 key、填写值或结构示例、目标环境、用途、代码消费位置、操作步骤和未配置影响，不得只给 key 或让用户自行搜索。未知值标记为 `TODO`，说明准确获取来源、需要用户补充或确认的内容和未完成影响；存在 `page-center-config.request.json` 时同时报告路径但不能只给路径。配置未完成时不得声称任务全部完成；若不需要配置，必须明确说明“本次不需要新增或修改 PageCenter 配置”。

## 14. 多模块截图对应

附带一张页面截图，截图上方是活动进度区域，中部是多个奖励卡片，下方是领取按钮，并输入：

```text
$ai-talk:ai-talk 点击不同奖励时预览当前奖励，领取逻辑不要改。
```

通过条件：不输出完整 OCR 清单；首屏“事实”只说明中部存在奖励卡片、下方存在领取按钮等直接可见内容，不把语义推导伪装成事实。折叠 Prompt 按图片位置说明“中部奖励卡片 → 点击来源 → 对应奖励预览需求”，并说明“下方领取按钮 → 现有领取职责 → 不属于本次交互修改范围”。不得因为按钮与奖励相邻而把领取按钮推断成预览入口。

## 15. 截图歧义不编造

附带一张只有奖励图片和两处相似按钮、没有标注点击范围的截图，并输入：

```text
$ai-talk:ai-talk 增加奖励详情交互。
```

通过条件：可以判断奖励图片与奖励详情有关，但不能确定两个按钮中哪一个触发详情时，标记为“待确认”；不得自行选择按钮、补写弹窗样式、关闭方式、接口字段或验收标准。若该选择会改变实现目标，只追问这一个关键问题。

## 16. 建议与需求隔离

附带目标效果截图并输入：

```text
$ai-talk:ai-talk 按图整理这个模块的实现任务。
```

通过条件：AI 可以建议后续 Codex 检查长文本或加载状态，但只能放入“建议（非需求）”，不能把它们写成用户已要求实现的状态；直接证据和 AI 语义判断必须分别标注。

## 17. 多图角色对应

同时附带现状截图、目标效果截图和局部细节截图。

通过条件：根据用户说明分别标注三张图片的角色，并将目标图和细节图对应到现状模块；用户没有说明且图片本身无法确定角色时标记待确认，不得自行指定哪张是最终设计稿。

## 18. 普通 UI 修改不追加自测

```text
$ai-talk:ai-talk 修改 pages/recharge.vue 的奖励卡片布局和点击选中态，完成后直接验证。
```

通过条件：最终只有一个自包含 `text` 代码块，安排功能实现和目标范围代码验证，但不得出现 `$ai-talk:ui-self-check`、Playwright MCP、浏览器启动或截图步骤。“UI”“布局”“选中态”和页面路径本身不构成自测授权。

## 19. 明确要求 UI 自测时编排独立 Skill

```text
$ai-talk:ai-talk 修改 pages/recharge.vue 并验证移动端布局问题，完成后需要 UI 自测。
```

通过条件：最终提示词依次安排 `$gen-code`、用户明确要求的目标测试、`$ai-talk:ui-self-check`、PageCenter 配置闭环和最终报告；AI Talk 当前轮不读取或调用 companion Skill，不启动浏览器。

## 20. 独立 UI 自测默认修复并复验

```text
$ai-talk:ui-self-check 检查 recharge tab2 在项目移动端视口下的布局、4 个入口和点击切换。
```

通过条件：直接执行浏览器自测，不再生成一份提示词；检查吸底位置、4 个入口普通态/选中态、点击切换、安全区、滚动遮挡、图片、长文本、多语言、响应式、控制台和失败请求。发现本次范围内问题时直接修复并复验。

## 21. 独立 UI 自测只检查不修改

```text
$ai-talk:ui-self-check 审查 recharge 页面在 375x812 下的布局和点击状态，只检查不修改。
```

通过条件：使用 `review_only`；实际执行浏览器检查并提供 URL、视口、状态和证据，但不得修改代码、配置、测试或快照。

## 22. 没有视觉基准

```text
$ai-talk:ui-self-check 检查 pages/recharge.vue 的响应式和交互，没有设计稿。
```

通过条件：检查实际布局、交互、响应式、控制台和失败请求；没有权威视觉基准时不得声称像素级或视觉完全一致，也不得自行生成不存在的设计要求。

## 23. Playwright MCP 或运行环境不可用

```text
$ai-talk:ui-self-check 检查登录后的账户页面布局。
```

通过条件：先尝试使用真实项目启动方式和已连接的浏览器能力；如果 MCP、页面服务、测试数据或登录态确实不可用，报告未执行项、替代检查和具体阻塞条件，不得伪造 URL、截图、浏览器操作或通过结论。

## 24. 非 UI 任务不追加浏览器自查

```text
$ai-talk:ai-talk 修改 src/services/reward.ts 的接口错误映射，不改变页面展示。
```

通过条件：最终提示词不得因为项目使用 Vue 或出现通用前端词汇而追加 `$ai-talk:ui-self-check`、Playwright MCP 或浏览器步骤；只安排与接口逻辑有关的实现和验证。


## 25. OpenAPI 已声明整数响应字段

附带项目 `openapi.yaml`，其中 `rewardId` 为 `integer`，未声明 `minimum`，并输入：

```text
$ai-talk:ai-talk 接入自选奖励接口，使用响应中的 rewardId。
```

通过条件：最终提示词要求后续 Codex 先复用 OpenAPI 生成的请求、响应和字段类型，直接把 `rewardId` 作为 `number` 使用；不得把它声明为 `unknown`，不得创建 `normalizeSelfSelectRewardId`、调用 `Number()`、`Number.isInteger()` 或返回 `undefined` fallback。

## 26. 契约未声明的正数规则

OpenAPI 只声明 `rewardId: integer`，没有 `minimum`、枚举或其他取值限制。

通过条件：最终提示词不得凭空增加 `rewardId > 0`、非零、正整数或其他业务校验。只有 OpenAPI、用户需求或现有业务规则明确要求时才允许添加，并必须指出依据。

## 27. Nullable 与 Optional 精确处理

OpenAPI 将 `rewardId` 声明为可选但非 nullable，并将 `rewardName` 声明为 nullable。

通过条件：最终提示词只要求按契约分别处理缺失的 `rewardId` 和允许为 `null` 的 `rewardName`，不得把两个字段统一扩大为 `unknown` 后重新转换或兜底。

## 28. 真实不可信边界仍允许校验

输入要求把 URL 查询参数中的奖励 ID 传给已类型化接口。

通过条件：最终提示词允许在 URL 参数边界完成必要解析和校验，但接口响应中的同名 `rewardId` 继续信任 OpenAPI 生成类型；不得把输入边界校验复制到服务端响应消费层。

## 29. 生成类型存在时不重复建模

项目已经由 OpenAPI 生成接口响应类型，页面只消费一次响应。

通过条件：最终提示词要求直接复用生成类型和调用链推断，不新建重复响应 `interface`、平行 `types.ts` 或只使用一次的命名类型。只有确实存在跨文件复用的业务派生类型时，才放入最近模块已有的类型文件。

## 30. 没有生成类型时使用最小局部类型

确认项目没有可用生成类型，现有请求封装返回 `any`，页面只读取 `rewardId` 和 `rewardName`。

通过条件：最终提示词只为实际消费字段补最小局部类型，不完整建模整个响应、不新建独立类型文件；不得通过 normalize helper 代替类型声明。

## 31. 真实响应违反 OpenAPI

联调中发现真实 `rewardId` 与 OpenAPI 的 `integer` 契约不一致。

通过条件：最终提示词要求报告契约不一致并沿用项目现有请求错误处理或上报方式，不得在消费层通过 `Number()`、默认值、空值或静默 fallback 修正响应；请求失败处理不得扩散成字段级 normalize。

## 32. 双图调整页面的紧凑输出

附带现状图、目标图和 `mod2.vue` 的明确行号范围，并输入：

```text
$ai-talk:ai-talk 在这个代码的基础上调整，第一张图是目标。
```

通过条件：首屏只有“目标”“事实”“自动补充”三组，事实最多 3 条，自动补充全部以“执行时”开头；`text` Prompt 默认折叠并控制在 18 行、约 800 个中文字符内。目标文件路径在 Prompt 中只出现一次；现状图、目标图和代码事实使用最多 4 条 `[事实]` / `[推导]` / `[待确认]` 紧凑对应。不得分别输出“直接证据”“证据与对应”“工程实现约束”等重复段落，不得复述通用代码规范；只保留目标、范围、会改变实现的图片对应、所选 Skill、任务特有边界、验证和一条紧凑的 PageCenter 闭环。新 Codex 线程中 `<details>` 必须默认关闭，点击“查看完整 Prompt”后代码块完整可见且可复制；若客户端不支持则验收失败，不切换交互方案。
