# AI Talk Context Gap 验收场景

<<<<<<< HEAD
## A. 状态型蒙层

`$ai-talk 奖励获取后增加蒙层，资源 icon/mask`

- `icon/mask` 是 `asset_resource`，不是目录或目标范围。
- 状态字段未说明时，只产生非阻塞 `state_condition` 缺口。
- Task Contract 提示后续 Codex 从当前项目代码验证，不立即追问。

## B. 状态映射冲突

`$ai-talk 这里 state=0，但页面显示已领取`

- 记录接口数据和页面表现冲突。
- `state_mapping` 是待验证关系和非阻塞缺口。
- 不直接判断 `state=0` 的业务含义，不产生“交付物不明确”。

## C. 泛化弹窗

`$ai-talk 开发一个弹窗`

- 不补充按钮、props、事件或样式。
- 缺少所属页面或模块确实导致无法定位时，`target_scope` 是唯一阻塞缺口。

## D. 页面检查

`$ai-talk 打开这个 URL 检查视觉和交互`

- `page_entry` 和 `inspection_goal` 已具备。
- 不要求目标文件、接口、设计稿或测试。
- 没有缺口时省略“上下文缺口”区域。

## E. 明确文件文案修改

`$ai-talk 修改 src/components/title.vue 的文案为“立即领取”`

- 确认目标文件与文案修改。
- 不产生接口、设计稿、测试或状态条件缺口。
- 直接生成简短 Task Contract。

## F. 证据与输出边界

- `icon/close`、`progress/bg-1` 等资源标识不得识别为目录。
- 截图只证明页面表现，不作为接口数据或代码实现事实。
- 每个 Gap 只包含 `type`、`reason`、`blocking` 和可选 `suggested_source`。
- 最多一个阻塞 Gap；非阻塞 Gap 不打断工作流。
- 默认输出不展示内部字段名、JSON、评分、绝对路径、检索计划或执行 Skill。
=======
## A. 积分阶段关联任务

`$ai-talk 在 banner-spin.vue 中，积分阶段 PROGRESS_TASK_ID: 7，然后一样展示进度和奖励`

- 任务目标说明积分阶段接入任务 7，并复用现有方式展示进度和奖励。
- 研发对象逐字保留 `banner-spin.vue`、`PROGRESS_TASK_ID=7`，并包含积分阶段。
- 关键关系为 `任务 7 数据 → 积分阶段进度与奖励展示`。
- 检索语义为积分阶段任务关联、进度展示逻辑、奖励展示逻辑。
- 实现约束为复用现有展示方式、不影响其他阶段。

## B. 第三个奖励未展示

`$ai-talk 为什么第三个奖励没显示`

- 任务目标为定位第 3 个奖励展示异常。
- 研发对象包含第 3 个奖励，不无依据补出领取状态。
- 检索语义为奖励状态映射、奖励展示条件、当前项目同类实现。
- 不输出 `reward-render`、`reward-index-mapping`、`claimed-state` 或 `stage3`。

## C. 状态与页面表现冲突

`$ai-talk state=0 页面却已领取`

- 接口字段逐字保留 `state=0`，状态规范化为已领取状态。
- 检索语义使用奖励状态映射、奖励展示条件和当前项目同类实现。
- 不认定 `state=0` 代表已领取或未领取，不直接判定接口或页面错误。

## D. 资源标识

`$ai-talk 奖励领取后增加 icon/mask 蒙层`

- `icon/mask` 进入资源，不生成研发文件对象，路径保持原样。
- 状态为已领取状态，视觉效果为蒙层。
- 检索语义使用奖励状态映射、蒙层展示逻辑和当前项目同类实现。

## E. 新增弹窗

`$ai-talk 开发一个弹窗`

- 研发对象只确认弹窗。
- 检索语义使用弹窗组件复用、弹窗触发逻辑和弹窗交互逻辑。
- 不预设 props、事件、按钮和业务逻辑。

## F. 分层与输出

- 中文默认输出只使用任务目标、研发对象、状态、视觉效果、资源、配置变量、接口字段、关键关系、检索语义、实现约束和建议 Skill。
- Retrieval Query、canonical entity、routing profile、评分、候选和分析过程不进入协议。
- 中文研发概念不输出英文 ontology；文件名、变量名、接口名、资源路径和 Skill 名称保持原样。
- 空栏目省略；建议 Skill 低置信时省略。
- 输出协议后停止，不执行代码修改或下游 Skill。
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
