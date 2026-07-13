# AI Talk

AI Talk 是一个 Codex 插件，用来识别开发任务，发现项目或公司已有的 Skill、Prompt、组件、工具函数和规范，再把模糊需求整理成边界明确、带复用要求的任务摘要。用户确认一次后，当前 Codex 会在同一个线程继续分析、规划或执行。

默认流程不再要求复制、滚动、粘贴和重新发送任务话术。只有明确要求“只生成话术、提示词或模板”时，AI Talk 才输出可复制代码块。

核心链路：

```text
自然语言需求
→ 识别任务类型和执行意图
→ 检索已有 Skill、Prompt、组件、工具和规范
→ 选择 1 个主能力和最多 2 个辅助能力
→ 生成带项目上下文和复用要求的任务摘要
→ 确认后交给当前 Codex 规划或执行
```

## 安装

用户不需要先下载这个项目，直接在终端运行：

```bash
codex plugin marketplace add StriveToLearnCode/ai-talk-marketplace --ref master
codex plugin add ai-talk@personal
```

检查安装结果：

```bash
codex plugin list
```

看到下面的状态表示安装成功：

```text
ai-talk@personal  installed, enabled
```

安装或更新后，需要新建一个 Codex 对话，让新线程加载最新 Skill。

### 本地开发安装

只有开发插件本身时才需要 clone 仓库。进入仓库目录后运行：

```bash
codex plugin marketplace add "$PWD"
codex plugin add ai-talk@personal
```

### 安装失败时

当前 marketplace 标识是 `personal`。如果用户已经配置了另一个同名 marketplace，Codex 会拒绝重复添加；这是当前版本的分发限制。

先确认 Codex CLI 支持插件命令：

```bash
codex plugin --help
```

如果 GitHub 仓库是私有的，还需要先配置可访问该仓库的 Git 凭据。

## 怎么用

AI Talk 只在显式调用时启用：

```text
$ai-talk <你的自然语言需求>
```

### Bug 定位

```text
$ai-talk 轮播图偶尔不切换，先帮我看看
```

AI Talk 会识别为“Bug 定位 + 只分析”，展示排查范围、证据要求和验收结果。确认“继续处理”后，当前 Codex 直接开始定位，并明确禁止修改代码。

### UI 或多语言检查

```text
$ai-talk 这个活动原来是俄语，现在改成法语，看看还有哪些没替换
```

AI Talk 会在摘要中覆盖代码文字、语言资源、图片文案、接口动态内容和页面截图；确认后开始检查，不修改业务逻辑。

### 接口联调

```text
$ai-talk 根据这个接口文档把奖励接口接一下
```

没有明确执行方式时，默认先给方案。摘要会包含契约依据、参数和字段映射、加载、空数据、失败及重复请求状态；确认后当前 Codex 直接输出方案。

### 直接执行

需要 Codex 在确认后直接修改时，要明确说明：

```text
$ai-talk 根据接口文档直接把奖励接口接好并验证
```

### 还是不行

上一轮处理后问题仍存在，可以在同一个对话继续输入：

```text
$ai-talk 还是不行
```

AI Talk 会复用上一轮已有信息，整理新的返工摘要；确认后先检查修改是否生效、环境是否使用最新代码，再继续定位。

## 三种执行方式

| 用户表达 | 执行方式 | 确认后的结果 |
| --- | --- | --- |
| “帮我看看”“先定位”“不要改代码” | 只分析 | 禁止修改代码，只定位并提供证据 |
| “先给方案”“确认后再做” | 先给方案 | 先说明原因、方案和影响范围 |
| “直接修复”“实现并验证” | 直接执行 | 在当前模式和权限允许时修改并验证 |

表达冲突时使用更保守的方式：只分析优先于先给方案，先给方案优先于直接执行。

## 确认后继续

默认调用会展示：

1. 识别到的任务场景。
2. 本轮执行方式。
3. 任务目标、相关范围和验收结果。
4. 是否启用最小改动及是否读取了项目上下文。
5. 已确认的主能力、辅助能力和复用对象；无匹配时明确标记。
6. “继续处理 / 只生成话术 / 调整要求”三个选择。

优先使用可点击的结构化选择；当前模式不支持时，只需回复“继续”“生成话术”或“调整”。选择“继续处理”后，当前 Codex 直接沿用摘要继续工作，不会再次输出完整任务话术。

## 只生成话术

需要可复制文本时明确说明：

```text
$ai-talk 只帮我生成一段轮播图排查话术
```

这类请求不会进入确认执行流程。AI Talk 会保留识别反馈和单个 `text` 代码块，默认话术为 150–300 个中文字符，简单任务不超过 200 字。

## 个人配置

可选配置文件：

```text
~/.codex/ai-talk/preferences.json
```

示例：

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

配置文件不存在时会使用内置默认值。用户在当前任务中的明确指令始终优先于配置，配置不会绕过 Codex 当前模式或权限。

## 公司能力目录

AI Talk 不假设固定公司路径。已知统一 Skill、Prompt 或组件目录时，可通过 `--source-root company-name=/absolute/path` 传给统一的 `collect_context.py` 上下文命令，或设置 `AI_TALK_CAPABILITY_ROOTS`。未配置或目录不存在时会降级到项目与用户级来源，不会编造能力。

## 更新

GitHub marketplace 更新后重新安装：

```bash
codex plugin marketplace upgrade personal
codex plugin add ai-talk@personal
```

随后新建 Codex 对话。

## 开发验证

运行脚本测试：

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s plugins/ai-talk/skills/ai-talk/tests -v
node --test plugins/ai-talk/skills/ai-talk/tests/test_build_capability_index.mjs
```

更多实现说明见 [插件 README](plugins/ai-talk/README.md)，新线程验收用例见 [acceptance-cases.md](plugins/ai-talk/tests/acceptance-cases.md)。
