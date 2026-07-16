# AI Talk Context Gap 验收场景

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
