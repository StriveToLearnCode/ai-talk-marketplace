---
name: ai-talk
description: 在用户显式调用 $ai-talk:ai-talk 并希望为研发任务选择公司 Skill 时，原样保留用户目标，将口语、截图角色和任务动词规范化为检索画像，基于真实运行时 SKILL.md frontmatter 推荐 Top 1 与最多 2 个备选 Skill，并解释相近 Skill 的排除原因。只做路由，不执行任务、不调用下游 Skill、不生成执行 Prompt。
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
- Figma 只作为开发证据时不选 `figma-analyze`。
- 只有 PageCenter 配置/推送产物才选配置 Skill。
- 只有活动积木或 uiMeta 可配置玩法块才选积木 Skill。
- “测一下”是泛化词；没有 Midscene 或测试文件产物时不得选择 `ai-test`。

## 输出

```text
用户原始目标：<原文>
检索画像：<八字段摘要；扩展词单独标注>
推荐 Skill：<真实 name> — <真实路径>
备选 Skill：<最多 2 个；没有则省略>
推荐依据：<多维依据>
排除相近 Skill：<真实名称、路径和原因>
待确认：<最多一个真正阻塞项；没有则省略>
索引冲突：<重复 name 和路径；没有则省略>
```

不得输出 `<details>`、长执行 Prompt、短 Prompt、伪执行按钮或自动调用步骤。完成路由报告后立即停止。
