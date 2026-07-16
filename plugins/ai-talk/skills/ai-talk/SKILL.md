---
name: ai-talk
description: 在用户显式调用 $ai-talk 时，识别研发意图，从用户文本、真实附件和明确项目上下文提取带来源的研发概念，按 Docs、Skill、组件和代码生成分类检索查询，并在内部路由到真实公司 Skill。只增强任务上下文和检索表达，不扩展业务需求、不代替下游 Skill 执行。
---

# AI Talk 研发任务上下文增强器

保留用户原始业务意图，提取有来源的真实上下文和研发概念，将其规范化为适合检索公司 Docs、Skill、组件知识库和项目已有实现的分类查询，再把结果交给真实执行 Skill。不要扩写成长 Prompt，也不要把 Skill 推荐作为主体。

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
intent: bug_fix | feature_create | feature_modify | ui_inspection | planning | automated_test | unknown
entities:
  ui_component | business_object | state | layout_scene | config_or_symbol | issue_symptom | target_scope:
    - value: 规范化检索值
      label: 前台展示名
      source: user_text | user_text:path | attachment:<序号>
retrieval_query_groups:
  docs: []
  skills: []
  components: []
  code: []
retrieval_queries: 四类查询按 docs、skills、components、code 顺序展平的兼容数组
retrieval_directions:
  - 面向用户的概括性检索方向
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

- 先识别 `intent`，再从用户原话、真实附件摘要和明确上下文分别提取带 `source` 的研发概念；不得直接使用用户原话作为 Query 主体。
- Docs、Skill、Component、Code 每类最多生成 3 个高价值查询；删除低信息量、重复和仅追加固定后缀的查询。
- Docs 只查询已提取业务对象、状态含义和布局规范；Skill 只查询当前 intent 与期望产物；Component 只查询真实组件类别；Code 只查询真实路径、符号和实体相关实现。
- 可以扩展中英文同义词和公司常用表达，例如将“弹窗”扩展为 `dialog`、`modal`、`popup`。
- 扩展词只是建议检索，不得写成用户已确认需求。
- `progressRewardConfig` 等精确代码符号只有在用户文本、真实附件或选中代码中实际出现时才允许提取和查询。
- “图片没有显示”是问题表现，不是截图证据；只有 `--evidence-type` 提供的真实附件内容可以贡献附件来源实体。
- 不维护另一套公司组件索引，不预设用户未提及的组件名称，不编造 Docs、Skill、路径、接口或业务规则。
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

默认输出不展示 `intent`、实体内部字段、分类 Query 或兼容 Query 数组。展示用户目标、真实上下文、可靠研发概念、概括性检索方向和任务边界，并在结尾显示真实 Skill 名称：

```text
用户目标：
<原始业务意图>

已确认上下文：
- <真实上下文>

研发概念：
- 组件：<可靠组件概念>
- 场景：<可靠布局场景>
- 状态：<可靠状态>
- 问题：<可靠问题表现>

检索方向：
- <检索方向>

任务边界与未知项：
- 边界：<真实适用边界>
- 尚未确认：<最多一个阻塞项>

执行能力：<真实 Skill 名称>
```

无法可靠提取的概念行直接省略；没有可靠概念或检索方向时不显示对应区域，不得用猜测或低信息量占位补齐。

不得显示大块“AI 已决定”“为什么选择 Skill”“未选择 Skill”、职责介绍、评分、候选或绝对路径。只有输入同时明确要求两个容易混淆的交付物，存在真正 Skill 选型歧义时，才在执行能力前增加一行 `选型说明`。

旧 `--profile-json` 协议保持禁用。完成上下文整理后立即停止，不输出长 Prompt、实施步骤、代码、配置、测试结果、自定义 UI 或伪执行按钮。
