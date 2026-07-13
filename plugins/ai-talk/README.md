# AI Talk

AI Talk 是一个帮助开发者与 Codex 更准确沟通的插件。它先从项目、用户和已配置的公司目录中发现可复用的 Skill、Prompt、组件、工具函数和规范，再把模糊开发需求整理成目标、范围、执行方式、能力组合和验收结果明确的任务摘要。用户确认一次后，当前 Codex 在同一个线程继续处理。

```text
AI Talk：识别任务，发现已有能力，整理需求并等待一次确认
当前 Codex：按确认后的能力组合与权限继续分析、规划或执行
```

默认流程不再输出需要复制粘贴的中间话术。只有用户明确要求提示词、任务话术或模板时，AI Talk 才只生成可复制文本。

## 安装

用户不需要先下载仓库，可以直接从 GitHub marketplace 安装：

```bash
codex plugin marketplace add StriveToLearnCode/ai-talk-marketplace --ref master
codex plugin add ai-talk@personal
```

安装完成后新建 Codex 对话，让新线程加载更新后的 Skill。

检查安装状态：

```bash
codex plugin list
```

列表中应显示 `ai-talk@personal`，状态为 `installed, enabled`。

当前 marketplace 标识是 `personal`。如果用户已经配置了另一个同名 marketplace，Codex 会拒绝重复添加；这是当前版本的分发限制。

### 本地开发安装

已经 clone 本仓库时，可以添加本地 marketplace：

```bash
codex plugin marketplace add "$PWD"
codex plugin add ai-talk@personal
```

### 更新本地插件

仓库内容和 manifest 版本更新后，重新安装并新建对话：

```bash
codex plugin marketplace upgrade personal
codex plugin add ai-talk@personal
```

更新完成后新建 Codex 对话。

## 使用方式

只保留一个显式入口，不需要选择模板或填写表单：

```text
$ai-talk <自然语言开发需求>
```

例如：

```text
$ai-talk 轮播图偶尔不切换，先帮我看看
$ai-talk 这个活动原来是俄语，现在改成法语，看看还有哪些没替换
$ai-talk 根据这个接口文档把奖励接口接一下
```

AI Talk 会显示场景、执行方式、任务目标、相关范围、验收结果、最小改动、项目上下文和能力复用组合，然后提供“继续处理 / 只生成话术 / 调整要求”三个选择。选择“继续处理”后，当前 Codex 直接沿用摘要继续工作，不需要复制、滚动、粘贴或重新发送。

AI Talk 已关闭隐式调用。普通开发请求不会被额外确认，只有显式使用 `$ai-talk` 才进入这个流程。

## 三个核心场景

| 场景 | 自动补充重点 | 默认边界 |
| --- | --- | --- |
| Bug 定位 | 现象、预期、生命周期、状态、定时器、异步时序、根因证据和验证方式 | “帮我看看”“先定位”只分析，不修改代码 |
| UI/多语言迁移 | 代码文字、语言资源、图片文案、接口动态内容和截图对比 | 不修改业务逻辑，不增加设计外内容 |
| 接口联调 | 契约依据、请求参数、字段映射、加载、空数据、失败和重复请求 | 不编造字段，不修改无关公共请求代码 |

新需求开发、代码审查、重构清理、补充测试和技术方案讨论仍作为兼容的扩展场景保留，核心验收优先覆盖 Bug、UI/多语言和接口联调。

## 执行方式

- **只分析**：触发词包括“帮我看看”“排查”“先定位”“不要改代码”。确认后只定位并提供证据，不修改代码。
- **先给方案**：触发词包括“先给方案”“确认后再做”。确认后先输出原因、方案和影响范围，等待再次授权后修改。
- **直接执行**：触发词包括“直接修复”“帮我改好”“实现并验证”。确认后只授权当前任务范围内修改。

表达冲突时使用更保守的方式：只分析优先于先给方案，先给方案优先于直接执行。用户没有明确表达时，默认先给方案。

## 确认流程

在信息足够时，AI Talk 先展示简短任务摘要，不使用代码块。随后优先调用环境提供的结构化选择控件：

- **继续处理**：确认摘要，当前 Codex 立即按识别出的执行方式继续。
- **只生成话术**：输出可复制任务话术，不执行任务。
- **调整要求**：只追问会改变目标、范围、权限或验收的关键问题，更新摘要后重新确认。

结构化控件不可用时，用户只需回复“继续”“生成话术”或“调整”，仍不需要复制粘贴完整任务。

确认前 AI Talk 只收集上下文和澄清需求，不修改业务文件。确认不能绕过 Codex Plan 模式、沙箱权限、项目指令或其他更高优先级限制。

## 只生成话术

用户一开始明确要求提示词、任务话术、模板或可复制文本时，跳过确认执行流程：

```text
$ai-talk 只帮我生成一段轮播图排查话术
```

AI Talk 会输出五行识别反馈和一个 `text` 代码块，不继续执行。能力复用只写入已经读取并确认适用的候选。默认任务话术为 150–300 个中文字符，简单任务不超过 200 字。

## 统一项目上下文

AI Talk 只运行一个统一入口，同时收集基础项目上下文和相关能力：

```bash
python3 plugins/ai-talk/skills/ai-talk/scripts/collect_context.py \
  --root /path/to/project \
  --query '当前自然语言开发需求' \
  --related src/pages/example.ts
```

脚本输出 JSON，包括项目类型、包管理器、`package.json` scripts、Git 分支和变更文件、关键说明文件、相关文件范围、能力候选、有效偏好、警告及错误。`task_context` 是 AI Talk 生成当前任务协议时使用的统一对象，其中 `capabilities.selected` 包含一个主能力和最多两个辅助能力。

上下文采集器不会读取 `.env`、密钥、令牌、`node_modules`、构建产物或仓库外路径，也不会递归扫描整个项目。AI Talk 只会把实际读取的项目事实写进摘要、话术或后续任务上下文。

## 能力索引与复用

统一入口内部调用本地 Node.js 能力索引引擎，不依赖数据库或云端服务。正常 AI Talk 流程不会分别运行两个脚本，也不会让模型手工拼接上下文。`build-capability-index.mjs` 仅保留为内部引擎和独立调试工具。

脚本发现并分类以下对象：

- 项目、用户目录和已安装 Codex 插件中的 `SKILL.md`。
- `prompts`、`templates`、`AGENTS.md`、README 和开发配置。
- `components`、`composables`、`hooks`、`utils` 中的业务组件与工具。
- `pages`、`views`、`examples`、`stories`、`legacy`、`archive` 中的同类实现。

能力部分只包含路径、名称、摘要、导出符号、来源和相关性，不复制完整源码。AI Talk 随后读取候选文件确认适用性，未发现可靠候选时不会强行复用。

公司目录没有硬编码。已知团队目录时增加可重复参数：

```bash
--source-root frontend-platform=/absolute/path
```

参数直接添加到统一的 `collect_context.py` 命令。也可以设置 `AI_TALK_CAPABILITY_ROOTS`，使用当前系统的路径分隔符连接多个 `label=/absolute/path` 条目。

## 个人偏好

可选配置路径：

```text
~/.codex/ai-talk/preferences.json
```

默认配置：

```json
{
  "language": "zh-CN",
  "default_mode": "plan-first",
  "minimal_change": true,
  "explain_commands": true,
  "require_verification": true,
  "avoid_unrelated_files": true,
  "output_style": "concise"
}
```

`default_mode` 支持 `analysis-only`、`plan-first` 和 `direct-execution`；`output_style` 支持 `concise` 和 `enhanced`。配置文件缺失时直接使用默认值；未知键会被忽略，非法值只回退对应默认项，不影响插件继续运行。

用户当前指令始终优先于配置，偏好不会扩大代码修改权限，也不会绕过当前 Codex 模式。

## “还是不行”

在同一对话继续输入：

```text
$ai-talk 还是不行
```

AI Talk 会复用上一轮已有的问题、判断、改动和验证结果，不要求重新描述全部背景。它会整理返工摘要；确认后先检查上一轮修改是否真正生效、当前环境是否使用最新代码，以及构建、缓存、部署、分支或启动进程，再重新收集证据并定位。

上一轮信息不在当前对话时，AI Talk 会明确标记未获取到，并最多询问一个会改变排查方向的问题，不会编造历史结论。

## 使用前后对比

| 直接提问 | 使用 AI Talk |
| --- | --- |
| “帮我看看为什么没生效” | 确认摘要后直接定位，不复制排查话术 |
| “看看还有哪些没替换” | 确认覆盖范围后直接检查代码、资源、图片和动态内容 |
| “把接口接一下” | 确认契约、异常状态和修改边界后直接输出方案 |

实际效果只通过真实任务记录评估，不使用虚假的 Prompt 分数。试用记录模板位于 `docs/trial-record.csv`，指标口径位于 `docs/evaluation.md`。

## 验证

运行无第三方依赖的脚本测试：

```bash
cd plugins/ai-talk
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s skills/ai-talk/tests -v
node --test skills/ai-talk/tests/test_build_capability_index.mjs
```

九个新线程人工验收用例位于 `tests/acceptance-cases.md`，覆盖确认、继续、调整、能力复用、无匹配降级、结构化控件降级、显式话术输出和隐式调用边界。

## 当前限制

- 不提供 Web 后台、账号、云同步或模板市场。
- 能力索引只使用本地文件元数据和有限代码符号；候选仍需读取文件确认，不提供语义向量数据库。
- 不执行复杂任务状态管理、完整 Git 审计或 Prompt 评分。
- 不保证在缺少接口文档、设计资料或运行证据时直接得出技术结论。
- 150–300 字限制只适用于显式话术输出，不限制默认确认摘要和后续任务结果。
- 真实试用指标必须由同事实际使用后填写，仓库不预置结果。

## 常见问题

### AI Talk 会直接修改代码吗？

确认前不会。执行方式为“直接执行”且用户选择“继续处理”后，当前 Codex 可以在任务范围、当前模式和权限允许的前提下修改并验证。

### 为什么普通开发请求没有触发 AI Talk？

新流程会增加一次明确确认，因此只在用户显式调用 `$ai-talk` 时启用。普通请求保持 Codex 原有处理方式。

### 为什么有时会追问？

只有答案会改变任务目标、执行方式、修改范围、能力选择或验收结果时才追问。默认最多一个问题，特殊情况一轮不超过三个。

### 为什么没有读取整个项目？

项目上下文只用于减少误解。AI Talk 会先读取项目指令、清单和用户直接相关文件；能力索引只扫描约定的项目目录、常见 Skill 根目录和显式公司目录，避免无关扫描和敏感信息暴露。

### 配置写错会导致插件不可用吗？

不会。非法项会回退默认值并显示简短配置提示，其余有效配置继续生效。
