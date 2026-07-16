---
name: ai-talk
description: 在用户显式调用 $ai-talk 时，将研发需求、附件和真实项目信息整理为带来源的上下文、检索查询、任务边界与阻塞未知项，并在内部路由到真实公司 Skill。只增强任务上下文和检索表达，不扩展业务需求、不代替下游 Skill 执行。
---

# AI Talk 研发任务上下文增强器

保留用户原始业务意图，提取有来源的真实上下文，将自然语言和附件规范化为适合检索公司 Docs、Skill、组件知识库和项目已有实现的查询，再把结果交给真实执行 Skill。不要扩写成长 Prompt，也不要把 Skill 推荐作为主体。

## 每轮流程

1. 原样保留用户目标；只移除 `$ai-talk` 调用标记，不增加功能、交互、组件、数据结构或验收要求。
2. 检查本轮真实输入，识别目标目录、目标文件、选中代码和附件角色。每条上下文必须记录 `source`。
3. 仅运行一次 `scripts/route-company-skills.mjs`。附件按实际内容传入重复的 `--evidence-type`：
   - `visual=<附件摘要>`：视觉稿或设计稿。
   - `interaction=<附件摘要>`：交互图或流程图。
   - `api=<附件摘要>`：接口资料。
   - `screenshot=<附件摘要>`：无法进一步分类的真实截图。
   - `selected_code=<选中内容摘要>`：编辑器明确提供的选中代码。
4. 使用脚本默认文本作为最终输出。只有调试和测试可以增加 `--debug-json`。
5. 将 `execution_skill` 作为下游真实执行能力；AI Talk 本身不读取该 Skill 的知识库、不实施代码，也不编造执行结果。

```bash
node scripts/route-company-skills.mjs \
  --root <项目根目录> \
  --query '<用户原始输入>' \
  [--source-root <公司标签=真实Skill根>] \
  [--evidence-type 'visual=第一张图的真实摘要']
```

## 统一结果结构

默认展示字段来自以下结构：

```yaml
original_goal: 用户原始目标
confirmed_context:
  - type: target_file | target_directory | visual_design | interaction_flow | api_document | screenshot | selected_code
    value: 可展示的真实信息
    source: user_text:path | user_text:explicit_reference | attachment:<序号>
retrieval_queries:
  - 面向真实知识源的查询
boundaries:
  - 本任务真实适用的范围或禁止事项
unknowns:
  - 最多一个可能阻塞执行的问题
execution_skill: 真实索引中的 Skill 名称
```

Skill 评分、候选、重复名称、路径和索引统计仅存在于 `routing` 调试对象，不进入默认输出。

## 上下文证据

- 附件角色来自实际附件内容，顺序和 `source` 必须对应真实附件。
- “见截图、参考截图、截图如下、根据这张图”只表示用户明确引用截图；没有附件标记时不得写成“已提供截图”。
- “图片没有显示”“替换奖励图片”“图标”“背景图”等普通对象词不是截图附件。
- 设计稿、接口资料和路径只有在用户明确提供、明确引用或输入中真实出现时才进入 `confirmed_context`。
- 不固定加入项目代码、`AGENTS.md`、PageCenter、ESLint、Prettier 或任何不存在的上下文。

## 检索查询

- 默认生成 3～6 个高价值方向，覆盖当前任务真正适用的公司 Docs、Skill、组件知识库或项目已有实现。
- 可以扩展中英文同义词和公司常用表达，例如将“弹窗”扩展为 `dialog modal popup`。
- 扩展词只是建议检索，不得写成用户已确认需求。
- 不维护另一套公司组件索引，不预设具体组件名称，不编造 Docs、Skill、路径、接口或业务规则。
- 公司现有 Skill 负责消费自己的知识库并执行；AI Talk 只帮助它提出更准确的查询。

## 边界与未知项

- 边界只包含当前任务真实适用的修改范围、用户明确禁止事项，以及防止扩展未确认业务逻辑所需的约束。
- 只有新 UI 开发等确实适用的任务才提示优先复用已有实现和组件。
- 有明确目标路径时，修改范围可限制在该路径及必要直接依赖；不得凭空写“当前活动”。
- `unknowns` 最多一个可能阻塞执行的问题。若当前代码能够确定答案，应继续执行而不是追问。
- 明确文件 Bug 不追加泛化工程套话，也不为已有异常重复追问交付物。

## Skill 路由

路由继续只读取真实运行时 `SKILL.md` 的 frontmatter、`description`，以及标题明确标记为“触发条件/适用场景”的短段。索引当前项目 `.agents/skills/**/SKILL.md`、显式批准的公司 Skill 根和插件自带 `ui-self-check`；不索引 `plugins/ai-talk/docs/skills/` 对照副本，不读取 references、脚本、知识库或普通正文。

- `midscene-test.ts`、Midscene 测试文件或自动化测试产物：`ai-test`。
- 浏览器即时视觉、交互、响应式、控制台或网络检查：`ui-self-check`。
- `docs/plan/` 前端实施方案：`gen-frontend-plan`。
- 实际开发或修复前端代码，包括普通弹窗：`gen-code`。
- Figma 仅作为开发证据时不选择 `figma-analyze`。
- 只有 PageCenter 配置或推送产物才选择配置 Skill。
- 只有活动积木或 uiMeta 可配置玩法块才选择积木 Skill。
- “测一下”没有测试文件产物时不得选择 `ai-test`。

## 默认输出

只展示四个区域，并在结尾显示真实 Skill 名称：

```text
用户目标：
<原始业务意图>

已确认上下文：
- <真实上下文>

建议检索：
- <检索方向>

任务边界与未知项：
- 边界：<真实适用边界>
- 尚未确认：<最多一个阻塞项>

执行能力：<真实 Skill 名称>
```

不得显示大块“AI 已决定”“为什么选择 Skill”“未选择 Skill”、职责介绍、评分、候选或绝对路径。只有输入同时明确要求两个容易混淆的交付物，存在真正 Skill 选型歧义时，才在执行能力前增加一行 `选型说明`。

旧 `--profile-json` 协议保持禁用。完成上下文整理后立即停止，不输出长 Prompt、实施步骤、代码、配置、测试结果、自定义 UI 或伪执行按钮。
