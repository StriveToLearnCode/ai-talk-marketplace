# AI Talk 验收场景

## A. 多附件分类

任务：开发 `recharge/components/dialogs` 下的礼物连爆弹窗，并提供视觉、交互、接口三张图。

- `confirmed_context` 分别记录 `visual_design`、`interaction_flow`、`api_document`，且 `source` 对应附件 1、2、3。
- 检索查询覆盖视觉规范、交互流程和接口用法。
- 不把三个附件合并成泛化“截图”。

## B. 明确文件 Bug

`$ai-talk 修复 src/components/reward-card.vue 中图片没有显示的问题`

- 只确认目标文件与问题表现。
- 不追加 PageCenter、ESLint、Prettier、`AGENTS.md` 等套话。
- 真实索引中存在 `gen-code` 时，结尾为 `执行能力：gen-code`。

## C. 泛化弹窗需求

`$ai-talk 开发一个弹窗`

- 检索词可以包含 `dialog modal popup`。
- 不得补充确认按钮、props、样式或具体组件名。
- 可将缺少所属页面或目标目录记录为唯一阻塞未知项。

## D. 图片对象词不是附件

`$ai-talk 图片没有显示，修一下`

- 不得生成 `screenshot` 上下文。
- 不得声称用户提供或引用了截图。

## E. 输出重心

所有编码任务仍可由内部路由选择 `gen-code`，但默认回复主体固定为：

1. 用户目标
2. 已确认上下文
3. 建议检索
4. 任务边界与未知项

结尾只显示一行执行能力。不得显示大块“AI 已决定”“为什么选择 Skill”或“未选择 Skill”；只有真正的交付物歧义才增加一行选型说明。

## F. 路由回归

- 即时 UI 检查与 Midscene 测试继续区分。
- 前端计划与实际代码开发继续区分。
- Figma 作为开发证据时不覆盖 `gen-code`。
- PageCenter 配置、活动积木、服务生成等专用 Skill 只在对应产物明确时选择。
- 基准至少 20 条，并报告 Top 1、Top 3、混淆矩阵和错误案例。
