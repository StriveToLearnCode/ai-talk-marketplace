---
name: ai-talk
description: 在用户显式调用 $ai-talk:ai-talk 并希望为研发任务选择公司 Skill 时，基于真实运行时 SKILL.md 决定一个 Skill，并以 Execution Brief 解释任务理解、具体决策依据、将利用的真实上下文和 Skill 职责。只做决策解释，不执行任务、不调用下游 Skill。
---

# AI Talk Decision Layer

完成公司 Skill 路由，并用执行前摘要解释 AI 的决策。不要扩展 Prompt Builder，不读取或执行候选 Skill 正文。

## 边界

1. 原样保留用户目标，不增加功能、交互、组件、数据结构或验收要求。
2. 每轮只运行一次 `scripts/route-company-skills.mjs`，使用其默认用户文本输出。
3. 只索引当前项目 `.agents/skills/**/SKILL.md`、显式批准的公司 Skill 根和插件自带 `ui-self-check`。
4. 只解析 `SKILL.md` frontmatter 的真实 `name`、`description`，以及标题明确标记为“触发条件/适用场景”的短段；不读取其他正文、references、脚本或知识库。
5. 不索引 `plugins/ai-talk/docs/skills/` 对照副本，不扫描组件源码、普通文档或 `.claude/skills` 补候选。
6. 不修改代码，不访问外部工具，不运行测试、构建、服务或部署。
7. 不调用已决定或备选 Skill，不生成详细实施方案、Context Builder、组件库或自定义 UI。

## 内部检索画像

内部保留 `original_goal`，并生成：

- `task_action`
- `target_category`
- `desired_output`
- `execution_mode`
- `evidence_types`
- `intent_terms`
- `exclusion_terms`
- `unknowns`

仅在当前请求真实包含图片附件、显式传入 `evidence_type=screenshot`，或用户明确说“见截图、参考截图、截图如下、根据这张图”时，才把截图作为 `screenshot` 证据。“图片、图标、背景图、已领取图片”等对象词不代表用户提供了截图。脚本返回的 `expanded_terms` 只用于检索召回，不得写成用户已确认需求。

## 索引与匹配

```bash
node scripts/route-company-skills.mjs \
  --root <项目根目录> \
  --query '<用户原始输入>' \
  [--source-root <公司标签=真实Skill根>] \
  [--evidence-type screenshot]
```

默认入口只输出用户文本。仅内部调试和测试可显式增加 `--debug-json` 查看路由数据；旧 `--profile-json` 协议已禁用，不得进入默认流程。

重复 `name` 必须在内部调试结果中报告全部真实路径。匹配综合期望产物、执行方式、适用场景、目标类别和排除项，单个关键词不能独立决定 Top 1。

- 生成或维护 `midscene-test.ts`、Midscene 用例或报告：`ai-test`。
- “打开页面 / 看看页面 / 浏览器检查”与“视觉 / 交互 / 响应式 / 控制台 / 网络”同时出现时，优先视为即时 UI 检查并选择 `ui-self-check`；“有问题、异常、不对”等泛化词不能覆盖此意图。
- 输出 `docs/plan/`：`gen-frontend-plan`。
- 实际修改前端代码：`gen-code`。
- “为什么没有显示”“这里不对”“修一下”等明确指向已有实现的异常默认按定位并修复处理，选择 `gen-code`；即时 UI 检查场景只有明确要求定位并修改现有代码时才选择 `gen-code`。
- Figma 只作为开发证据时不选 `figma-analyze`。
- 只有 PageCenter 配置/推送产物才选配置 Skill。
- 只有活动积木或 uiMeta 可配置玩法块才选积木 Skill。
- “测一下”是泛化词；没有 Midscene 或测试文件产物时不得选择 `ai-test`。

## Execution Brief

独立 `format-user-output.mjs` 将内部路由结果转换为最终文本。输出按“AI 理解 / 为什么这样决定 / AI 将利用 / AI 已决定”组织，使用确定语气，不得用“推荐”“可能”“建议”表达已完成的决策。

```text
💡 AI 理解
<任务类型>
<一句话说明用户目标。>

🤔 为什么这样决定？
✓ <最多 4 条当前任务中的具体事实>

🚀 AI 将利用
<仅列出已确认且本轮确实会读取的上下文；没有则明确没有额外上下文>

🛠 AI 已决定
<Skill 名称>
负责<职责>
```

检索画像、候选路径、索引统计、重复 `name` 冲突、评分、匹配词和 warnings 都是内部调试数据，不得出现在默认回复中。只使用真实 Skill 名称，不显示绝对路径、备选列表或内部字段名。

“为什么这样决定？”最多 4 条，只能写当前任务中已明确的目标对象、输入证据和期望产物；不得写“适用范围相关”等泛化理由。

“AI 将利用”是动态上下文清单，不是执行步骤。截图、设计稿和接口文档只在本轮真实提供或明确引用时显示；项目代码、`AGENTS.md` 和已有组件只在对应路径真实存在且已决定工作流会读取时显示。不得固定输出“读取规范”“格式化代码”“验证代码”等默认工程动作。

Skill 名称下必须显示一句职责，例如 `gen-code / 负责代码开发`、`ui-self-check / 负责浏览器检查`、`gen-frontend-plan / 负责实施方案设计`。只有在一个相近 Skill 确实容易引起疑问时，才在“AI 已决定”中补充“为什么不用<职责名称>？”和一句自然语言原因；不得输出“未选择”字段。最多 1 个阻塞性问题以“执行前需确认”并入“AI 已决定”，没有则省略。

不得输出 `task_action`、`target_category`、`desired_output`、`execution_mode`、`evidence_types`、`intent_terms`、`exclusion_terms`、`unknowns`、`query_terms` 原始字段名、绝对路径、评分、`matched_fields`、`matched_terms`、候选数组、索引详情、冲突详情或路由细节。不得输出 `<details>`、长执行 Prompt、短 Prompt、伪执行按钮、详细实施方案、自定义 UI 或自动调用下游 Skill。完成决策解释后立即停止。
