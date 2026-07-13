# AI Talk

AI Talk 是一个帮助开发者与 AI 更准确沟通的 Codex 插件。它把一句模糊开发需求补全为目标、范围、执行方式和验收结果明确的任务话术，让 Codex 少猜测、少跑偏、少重复沟通。

```text
AI Talk：帮助用户说清楚要做什么
Codex Plan：规划具体怎么做
Codex：执行代码修改
```

AI Talk 只生成任务话术，不直接执行开发任务，也不替代 Codex Plan。

## 安装

本仓库是一个名为 `ai-talk-marketplace` 的本地 Codex marketplace。

```bash
cd /path/to/ai-talk-marketplace
codex plugin marketplace add "$PWD"
codex plugin add ai-talk@ai-talk-marketplace
```

安装完成后新建 Codex 对话，让新线程加载更新后的 Skill。

检查安装状态：

```bash
codex plugin list
```

列表中应显示 `ai-talk@ai-talk-marketplace`，状态为 `installed, enabled`。

### 从旧版 personal 迁移

旧版使用 `ai-talk@personal`。进入新版仓库后直接添加新 marketplace 并安装新选择器，不要移除可能包含其他个人插件的 `personal` marketplace：

```bash
codex plugin marketplace add "$PWD"
codex plugin add ai-talk@ai-talk-marketplace
```

确认新版本正常后，可通过 `codex plugin list` 核对旧条目；旧 marketplace 的清理由其所有者单独决定。

### 更新本地插件

仓库内容和 manifest 版本更新后，重新安装并新建对话：

```bash
codex plugin add ai-talk@ai-talk-marketplace
```

如果使用 Git marketplace，先拉取或执行 `codex plugin marketplace upgrade ai-talk-marketplace`，再重新安装。

## 使用方式

只保留一个入口，不需要选择模板或填写表单：

```text
$ai-talk <自然语言开发需求>
```

例如：

```text
$ai-talk 轮播图偶尔不切换，先帮我看看
$ai-talk 这个活动原来是俄语，现在改成法语，看看还有哪些没替换
$ai-talk 根据这个接口文档把奖励接口接一下
```

AI Talk 会先显示场景、执行方式、最小改动和项目上下文状态，再将完整任务话术放进一个 `text` 代码块。默认任务话术为 150–300 个中文字符，简单任务不超过 200 字。

## 三个核心场景

| 场景 | 自动补充重点 | 默认边界 |
| --- | --- | --- |
| Bug 定位 | 现象、预期、生命周期、状态、定时器、异步时序、根因证据和验证方式 | “帮我看看”“先定位”只分析，不修改代码 |
| UI/多语言迁移 | 代码文字、语言资源、图片文案、接口动态内容和截图对比 | 不修改业务逻辑，不增加设计外内容 |
| 接口联调 | 契约依据、请求参数、字段映射、加载、空数据、失败和重复请求 | 不编造字段，不修改无关公共请求代码 |

新需求开发、代码审查、重构清理、补充测试和技术方案讨论仍作为兼容的扩展场景保留，但不属于 v1 核心验收范围。

## 执行方式

- **只分析**：触发词包括“帮我看看”“排查”“先定位”“不要改代码”。生成结果明确禁止修改代码。
- **先给方案**：触发词包括“先给方案”“确认后再做”。先输出原因、方案和影响范围，等待确认后修改。
- **直接执行**：触发词包括“直接修复”“帮我改好”“实现并验证”。只授权当前任务范围内修改。

表达冲突时使用更保守的方式：只分析优先于先给方案，先给方案优先于直接执行。用户没有明确表达时，默认先给方案。

## 项目上下文

AI Talk 使用内置脚本读取有限、可验证的项目上下文：

```bash
python3 plugins/ai-talk/skills/ai-talk/scripts/collect_context.py \
  --root /path/to/project \
  --related src/pages/example.ts
```

脚本输出 JSON，包括项目类型、包管理器、`package.json` scripts、Git 分支和变更文件、关键说明文件、相关文件范围、有效偏好、警告及错误。

它不会读取 `.env`、密钥、令牌、`node_modules`、构建产物或仓库外路径，也不会递归扫描整个项目。AI Talk 只会把实际读取的项目事实写进任务话术。

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

用户当前指令始终优先于配置，偏好不会扩大代码修改权限。

## “还是不行”

在同一对话继续输入：

```text
$ai-talk 还是不行
```

AI Talk 会复用上一轮已有的问题、判断、改动和验证结果，不要求重新描述全部背景。返工话术会先检查上一轮修改是否真正生效、当前环境是否使用最新代码，以及构建、缓存、部署、分支或启动进程，再要求重新收集证据并定位。

上一轮信息不在当前对话时，AI Talk 会明确标记未获取到，并最多询问一个会改变排查方向的问题，不会编造历史结论。

## 使用前后对比

| 直接提问 | 使用 AI Talk |
| --- | --- |
| “帮我看看为什么没生效” | 明确问题现象、只分析权限、排查范围、证据要求和验证方式 |
| “看看还有哪些没替换” | 覆盖代码、语言资源、图片和接口动态内容，并要求页面对比 |
| “把接口接一下” | 指定契约依据、字段映射、异常状态、修改边界和联调验证 |

实际效果只通过真实任务记录评估，不使用虚假的 Prompt 分数。试用记录模板位于 `docs/trial-record.csv`，指标口径位于 `docs/evaluation.md`。

## 验证

运行无第三方依赖的脚本测试：

```bash
cd plugins/ai-talk
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s skills/ai-talk/tests -v
```

五个新线程人工验收用例位于 `tests/acceptance-cases.md`，覆盖 Bug、UI/多语言、接口默认模式、接口直接执行和“还是不行”。

## 当前限制

- 不提供 Web 后台、账号、云同步或模板市场。
- 不执行复杂任务状态管理、完整 Git 审计或 Prompt 评分。
- 不保证在缺少接口文档、设计资料或运行证据时直接得出技术结论。
- 300 字限制只计算任务话术代码块，不包含四行识别反馈和真实上下文列表。
- 真实试用指标必须由同事实际使用后填写，仓库不预置结果。

## 常见问题

### AI Talk 会直接修改代码吗？

不会。它只生成可以交给 Codex 的任务话术。话术中的“直接执行”表示允许后续 Codex 在当前任务范围内修改。

### 为什么有时会追问？

只有答案会改变任务目标、执行方式、修改范围或验收结果时才追问。默认最多一个问题，特殊情况一轮不超过三个。

### 为什么没有读取整个项目？

项目上下文只用于减少误解。AI Talk 会先读取项目指令、清单和用户直接相关文件，避免无关扫描和敏感信息暴露。

### 配置写错会导致插件不可用吗？

不会。非法项会回退默认值并显示简短配置提示，其余有效配置继续生效。
