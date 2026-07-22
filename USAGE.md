# AI Talk 使用说明

AI Talk 把开发需求编译为可执行、可验收的 `RequirementContract 1.0`，并对明确故障执行必要的只读诊断。它不为了必须路由而推荐其他 Skill；UI 异常由它直接执行浏览器运行态取证。用户明确说“执行”后，当前代码 Agent 继承契约继续实施和验证。

## 使用方式

在 Codex 中打开项目后输入：

```text
$ai-talk:ai-talk <你的原始需求>
```

推荐直接写目标和已知范围，不需要先整理成规范需求文档。

## 它会做什么

- 找出答案不同会改变交付结果的真正歧义。
- 一次最多询问 2 个问题，优先确认范围和行为。
- 提醒最多 3 条与当前任务直接相关的风险。
- 用户确认后输出固定 JSON 契约，并补齐可观察验收标准。
- 根据每次回答增量收敛，只追问仍未确认的内容。
- 用户说“执行”“开始执行”或“按这个做”时，在同一任务内直接进入代码实施与验证。
- 对“为什么”“前端还是后端”等请求，从指定文件和行号沿控制、数据、渲染三层定位。
- 保存接口响应、状态回写、请求锁和最终渲染字段等高价值证据，并给出可验证定责条件。
- 对不显示、位置异常、遮挡、点击无效、修改后仍未生效或截图不一致等 UI 异常，直接检查页面状态、运行时条件、DOM、布局层级、资源和截图。

## 它不会做什么

- 澄清模式不读取或检索仓库、代码、Docs、AGENTS.md 或其他 Skill；诊断模式只读取故障链必要范围。
- 在契约获得明确执行授权前，不给具体实现步骤，不修改代码、配置、测试或快照，不运行写入型验证。
- 不推荐、安装或调用代码 Skill。
- 不把 UI 异常转交给 `ui-self-check`，也不点击领取、提交、支付或其他会写入业务数据的控件。
- 不询问代码 Agent 能从项目自行定位的文件名和实现细节。
- 不重复已经确认的问题，不把推导出的验收项伪装成用户原话。

## 示例

输入：

```text
$ai-talk:ai-talk 这两部分的用户头像都需要 pag/user 溜光
```

信息不足时，AI Talk 输出：

```text
需要确认
1. “这两部分”只指 recharge，还是 voice 的同款区域也同步？
2. pag/user 是每个头像各自循环播放，还是整个头像列表共用一个实例？

风险提醒
- 同页多头像可能触及 ui-pag 实例上限。
- 每个 PAG name 必须唯一。
- 覆盖层不得拦截头像点击。
```

收到“两处都要，每个头像独立循环”后，AI Talk 输出确认结果、验收标准和契约：

```json
{
  "schemaVersion": "1.0",
  "status": "ready_to_execute",
  "authorization": "pending",
  "sourceRequest": "这两部分的用户头像都需要 pag/user 溜光",
  "mode": "clarification",
  "scope": ["recharge", "voice"],
  "target": "用户头像",
  "effect": "pag/user",
  "instanceModel": "per_target",
  "playback": "loop",
  "constraints": [
    {"text": "每个 PAG name 唯一", "source": "derived"},
    {"text": "动画层不拦截头像点击", "source": "derived"}
  ],
  "acceptance": [
    {"text": "recharge、voice 中所有用户头像均持续播放溜光", "source": "clarification"},
    {"text": "多个头像同时使用独立实例循环播放", "source": "clarification"},
    {"text": "列表切换或数据刷新后动画仍正常", "source": "derived"},
    {"text": "PAG 层不影响头像原有点击", "source": "derived"},
    {"text": "资源加载失败时页面不阻塞且头像仍可用", "source": "derived"}
  ],
  "evidence": [],
  "openQuestions": []
}
```

如果原始请求已经明确，AI Talk 不为了制造对话而提问，直接生成契约。下一条消息为“执行”时，契约转为 `executing + authorized`，当前代码 Agent 开始修改；不会再次询问范围、实例模型或修改权限。

## 诊断模式

例如：

```text
$ai-talk:ai-talk 为什么 src/pages/wish.vue:120 选择奖励后仍显示旧值，是前端还是后端
```

AI Talk 将该请求标记为 `diagnosing + Bug 定位`，固定检查：

- 控制层：点击、确认、失败处理和页面关闭时机。
- 数据层：操作接口响应、状态回写、重新查询和请求锁。
- 渲染层：页面最终消费的状态字段。

定责条件固定可验证：接口失败但页面仍关闭属于前端错误处理；响应已有新值但页面仍显示旧值属于前端状态同步；操作成功且重新查询仍返回旧值属于后端持久化或查询。没有专门诊断 Skill 时不推荐 `gen-code`。

诊断结果会进入 RequirementContract 的 `evidence`，修复结果进入 `acceptance`。证据足够且没有硬阻塞时，契约转为 `ready_to_execute + pending`；下一条消息为“执行”时转为 `executing + authorized`，当前代码 Agent 直接复用这些证据修复和验证，不重新分类、大范围扫描或询问修改权限。

### UI 运行态取证

例如：

```text
$ai-talk:ai-talk 最后一个奖励需要显示领取按钮，修改后还是没有
```

AI Talk 会复用独立的应用内浏览器或新标签页，并按固定顺序检查：

1. 当前 URL、精确视口和“最后一个奖励已选中”等目标状态。
2. `currentIndex`、奖励总数及最终渲染条件的实际值；无法读取时明确标记未验证。
3. `btn/receive` 对应 DOM 是否生成、数量和稳定标识。
4. 元素边界、可见样式、父级裁切、堆叠上下文及实际遮挡元素。
5. 图片或背景资源的最终 URL、固有尺寸、网络结果和相关控制台错误。
6. 与 URL、视口和页面状态绑定的目标截图。

条件为假归入状态或渲染条件；条件为真但 DOM 不存在归入渲染链；DOM 存在但零尺寸、越界、被裁切或遮挡归入布局层级；资源请求失败或图片没有有效尺寸归入资源加载。当前不是最后一个奖励时只报告前置状态不满足，不把按钮未渲染判为缺陷。

浏览器、开发服务、完整 URL、登录态或目标数据不可用时，AI Talk 会说明已经尝试的步骤和恢复验证所需的最小条件，并将契约标记为 `blocked`。它必须写明“运行态尚未验证”，不得用静态代码推断冒充页面结果；用户说“执行”也不会绕过仍然存在的硬阻塞。

## 安装

```bash
codex plugin marketplace add /绝对路径/ai-talk-public-marketplace
codex plugin add ai-talk@ai-talk-marketplace
```

安装或更新后新建一个 Codex 任务，使新的 Skill 指令生效。可用 `codex plugin list` 确认安装状态。

## Legacy CLI

0.4 的 `route-company-skills.mjs`、TaskHandoff 1.1 和项目检索测试继续保留为兼容层，但不属于当前 `$ai-talk` 对话流程。维护兼容层时参阅 `skills/ai-talk/references/legacy-router.md`。
