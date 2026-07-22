# AI Talk 使用说明

AI Talk 是研发对话的单一前置门禁。非研发对话不触发；研发对话中的每条用户消息先经过它一次，再决定原样放行、编译或补充证据后放行，或者因真正硬阻塞暂不放行。

## 使用方式

```text
<你的原始需求>
```

安装后用户在研发对话中只需正常说话，无需添加 `$ai-talk` 前缀，也不需要判断该调用哪个 Skill。AI Talk 对研发对话中的每条消息只判断一次；交给下游 Skill 后不会再次进入门禁。

非研发对话完全不进入 AI Talk。研发对话中的状态询问、确认和无需重新编译的补充会原样放行，不生成空契约。明确研发任务会直接授权并路由；明确要求“用浏览器检查”“页面自测”时，由 AI Talk 放行并交接给 UI Self Check。

## 编译结果

- `skip`：直接放行。意图、目标行为和实现方向已经清楚，不做额外检索。
- `handoff`：增强后放行。限量检索找到了真实控制点、可复用入口或关键约束，将证据随契约交接。
- `clarify`：暂不放行。仍有会改变产品结果或写范围的硬分歧，只输出一个决定性问题。

明确的“中奖时播放音效”“动画结束后打开奖励弹窗”“点击 tab 时切换图片”属于实施请求，使用 `modify_and_verify + authorized`。原因诊断、“前端还是后端”和“只分析不要改”使用 `inspect_only`；后续消息为“执行”时，复用原证据切换到实施，不重新分类或大范围检索。

## 契约内容

`RequirementContract 1.2` 固定包含：

- 原始请求、result、执行 mode、authorization 和 next Skill。
- 用户标注的 `entry_point` 与证据确认的 `control_point`。
- 截图、DOM 和页面状态组成的 `target_refs`。
- 有证据支持的 `write_scope`、按执行顺序排列的 behavior、evidence 和 verification。
- 仅包含实施级硬阻塞的 `open_questions`。

默认在后台直接交接契约。宿主不能 handoff 时才显示紧凑 YAML，不附加需求复述、内部推理或授权口令。

## 截图标注

输入示例：

```text
这两处标注的用户头像都加上 pag/user 溜光
```

每个标注区域会生成独立 `target_ref`，保存稳定附件 ID、标注 ID、归一化边界和原始图片尺寸。截图不能证明 DOM、selector、组件名、页面路由或代码位置，这些字段不会被猜测。

## DOM 选择

输入示例：

```text
第二个头像也要一样
```

存在当前 DOM 选择时，AI Talk 使用已连接浏览器进行只读采集，并保存：

- 去除 token、session、signature 等敏感值后的 URL 与 route。
- 视口、可观察页面状态、frame path 和捕获时间。
- 优先使用 test ID、稳定 data 属性、稳定 ID 或可访问名称的 selector。
- 1-based ordinal，以及 tag、role、accessible name 和稳定属性组成的 fingerprint。

动态 class、生成 ID、绝对 XPath 和 `nth-child` 不得作为主 selector。selector 只能定位一组元素时，ordinal 单独保存，不编码进脆弱 selector。

## 浏览器上下文

“这里的弹窗”“当前这个页面”等指代可以绑定当前浏览器页面，即使没有选中 DOM。契约保存脱敏 URL、route、视口、页面状态、frame path 和捕获时间，DOM 保持 `null`。

浏览器上下文必须属于当前契约，并且与活动 URL 和页面状态一致。页面变化后重新捕获；不复用旧任务、旧标签页或不匹配 URL 的截图和 DOM 选择。只有一个新鲜上下文能解释指代时直接绑定；多个候选或没有证据时，只请求一次截图标注、DOM 选择或目标选择。

## 入口与控制点

用户选中的按钮、模板节点、代码行或视觉目标只是入口。AI Talk 只有在代码或运行态证据证明某个回调、分支或状态转换决定目标行为时，才填写 `control_point`；`write_scope` 同样只包含证据支持的文件。不得把 `entry_point` 或 `target_refs` 直接复制为控制点或写范围。

## 诊断

UI 异常按页面状态、条件实际值、DOM、边界与遮挡、资源和截图收集只读证据。诊断目标写入 `target_refs`，故障事实写入 `evidence`。浏览器不可用时明确标记未验证，不使用源码推断冒充运行现场，也不点击领取、提交、支付或确认等会写业务数据的控件。

## 安装

```bash
codex plugin marketplace add /绝对路径/ai-talk-public-marketplace
codex plugin add ai-talk@ai-talk-marketplace
```

安装或更新后新建 Codex 任务，使新的 Skill 指令生效。

## Legacy CLI

`route-company-skills.mjs`、TaskHandoff 1.1 和项目检索测试继续保留为兼容层，但不属于当前 AI Talk 对话协议。
