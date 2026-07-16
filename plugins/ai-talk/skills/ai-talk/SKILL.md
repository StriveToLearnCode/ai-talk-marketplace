---
name: ai-talk
description: 在用户显式调用 $ai-talk 并希望为研发任务选择公司 Skill 时，保留内部结构化检索画像，基于真实运行时 SKILL.md 推荐一个 Skill，并用约 150 字自然语言说明任务理解、执行建议、判断依据和一个必要的排除项。只做路由，不执行任务、不调用下游 Skill、不生成执行 Prompt。
---

# AI Talk Skill Router

只完成公司 Skill 路由。不要扩展 Prompt Builder，不读取或执行候选 Skill 正文。

## 边界

1. 原样保留用户目标，不增加功能、交互、组件、数据结构或验收要求。
2. 每轮只运行一次 `scripts/route-company-skills.mjs`。
3. 只索引当前项目 `.agents/skills/**/SKILL.md`、显式批准的公司 Skill 根和插件自带 `ui-self-check`。
4. 只解析 `SKILL.md` frontmatter 的真实 `name`、`description`，以及标题明确标记为“触发条件/适用场景”的短段；不读取其他正文、references、脚本或知识库。
5. 不索引 `plugins/ai-talk/docs/skills/` 对照副本，不扫描组件源码、普通文档或 `.claude/skills` 补候选。
6. 不修改代码，不访问外部工具，不运行测试、构建、服务或部署。
7. 不调用推荐或备选 Skill，不生成执行顺序、Context Builder、组件库或自定义 UI。

## 检索画像

保留 `original_goal`，并生成：

- `task_action`
- `target_category`
- `desired_output`
- `execution_mode`
- `evidence_types`
- `intent_terms`
- `exclusion_terms`
- `unknowns`

截图只作为 `screenshot` 证据。脚本返回的 `expanded_terms` 只用于检索召回，必须标注为检索扩展词，不得写成用户已确认需求。

## 索引与匹配

```bash
node scripts/route-company-skills.mjs \
  --root <项目根目录> \
  --query '<用户原始输入>' \
  [--source-root <公司标签=真实Skill根>] \
  [--evidence-type screenshot]
```

重复 `name` 必须报告全部真实路径。匹配综合期望产物、执行方式、适用场景、目标类别和排除项，单个关键词不能独立决定 Top 1。

- 生成或维护 `midscene-test.ts`、Midscene 用例或报告：`ai-test`。
- 即时页面视觉、交互、响应式、控制台或网络检查：`ui-self-check`。
- 输出 `docs/plan/`：`gen-frontend-plan`。
- 实际修改前端代码：`gen-code`。
- “为什么没有显示”“这里不对”“修一下”等已有实现异常默认按定位并修复处理，选择 `gen-code`；只有明确要求只分析、只检查不修改或只报告时，页面问题才选择 `ui-self-check`。
- Figma 只作为开发证据时不选 `figma-analyze`。
- 只有 PageCenter 配置/推送产物才选配置 Skill。
- 只有活动积木或 uiMeta 可配置玩法块才选积木 Skill。
- “测一下”是泛化词；没有 Midscene 或测试文件产物时不得选择 `ai-test`。

## 输出

脚本返回的检索画像、候选路径、索引统计、重复 `name` 冲突和 warnings 都是内部调试数据，不得出现在默认回复中。只使用真实 Skill 名称，不显示绝对路径、备选列表或内部字段名；“未选择”最多展示 1 个最容易混淆的 Skill。

```text
AI 理解：
<一句话说明任务类型和用户目标。明显问题排查写成“Bug 排查”或“定位并修复”，不得写 unknown。>

推荐执行：
使用 <推荐 Skill 名称> <用自然语言说明建议的执行方式>。

判断依据：
- <最多 3 条与当前任务直接相关的理由>

未选择 <最容易混淆的 Skill 名称>：
<未选择原因；没有必要时整段省略。>
```

默认回复控制在约 150 个中文字符。不得输出 `<details>`、长执行 Prompt、短 Prompt、伪执行按钮、自动调用步骤、自定义 UI 或新的执行流程。完成路由报告后立即停止。
