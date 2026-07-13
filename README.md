# AI Talk

AI Talk 是一个 Codex 插件，帮助用户把研发需求表达清楚，并推荐公司或项目已有的 Skill、Prompt、组件、工具函数、同类实现和规范。

AI Talk 只准备任务，不替代 Codex Plan，不生成完整技术实施步骤，也不修改代码。所有任务话术都必须经过用户审查后才能交给 Codex。

核心流程：

```text
用户自然语言
→ 理解任务并补充必要上下文
→ 自动采用明确能力
→ 存在歧义时用户选择复用、参考或排除
→ 生成最终任务话术
→ 用户审查
→ 确认后交给 Codex
```

## 安装

```bash
codex plugin marketplace add StriveToLearnCode/ai-talk-marketplace --ref master
codex plugin add ai-talk@personal
```

安装或更新后新建 Codex 对话，让新线程加载最新 Skill。

本地开发安装：

```bash
codex plugin marketplace add "$PWD"
codex plugin add ai-talk@personal
```

## 使用

AI Talk 只在显式调用时启用：

```text
$ai-talk <自然语言研发需求>
```

第一版重点支持 Bug 定位、UI 或截图还原、多语言迁移检查、接口联调、新页面或新模块开发。

```text
$ai-talk 轮播图偶尔不切换，先帮我看看，不要修改代码
$ai-talk 根据截图开发一个独立榜单页面
$ai-talk 活动从俄语迁移成法语，看看还有哪些没替换
$ai-talk 根据接口文档接入奖励接口，不要编造字段
```

## 期望处理方式

AI Talk 识别的是后续 Codex 的期望处理方式，不是当前执行授权：

| 用户表达 | 期望处理方式 |
| --- | --- |
| “帮我看看”“先定位”“不要改” | `analyze`，只分析 |
| “先给方案”“讨论方案” | `plan`，先给方案 |
| “帮我开发”“接入”“修复” | `modify_and_verify`，修改并验证 |
| “审查代码” | `review`，只审查 |

用户未说明时默认 `plan`。即使识别为 `modify_and_verify`，AI Talk 也只生成待审查任务话术，不会直接修改代码。

## 任务状态

- `draft`：仍有阻塞问题。
- `ready_for_review`：话术已准备，等待审查。
- `confirmed`：用户明确确认，可交给 Codex。
- `revise`：用户要求调整。

所有新任务默认进入 `ready_for_review`，`requires_user_review` 始终为 `true`。有效操作文案为“确认任务 / 调整任务 / 取消”，不使用含义模糊的“继续”。

## 能力复用

AI Talk 通过一次轻量索引搜索公司级和项目级 Skill、Prompt、组件、utility、同类页面及项目规则，不打开业务源码、不定位根因、不运行测试。主 Skill、项目规则和明确匹配的项目能力自动写入话术；只有组件、方法或复用方向存在歧义时才需要用户选择：

- `prefer_reuse`：优先验证复用。
- `prefer_reference`：仅作参考。
- `excluded`：本次排除。

选择“优先复用”不代表已经兼容。只有确认后的 Codex 实际读取和验证代码后，才能给出 `confirmed_reuse`、`partial_reuse`、`incompatible` 或 `reference_only`。

没有歧义候选时直接生成待审查话术；存在未选择的歧义候选时任务暂处 `draft`，完成选择后回到 `ready_for_review`。

## 强制审查

最终输出会明确显示：

```text
任务状态：待用户审查
任务话术已准备，等待审查。
当前尚未执行代码修改。
```

生成后 AI Talk 立即停止，不继续读取业务代码、不运行项目命令、不修改文件，也不自动提交给 Codex。

## 公司能力目录

公司目录不硬编码。已知目录时传给统一上下文脚本：

```bash
python3 plugins/ai-talk/skills/ai-talk/scripts/collect_context.py \
  --root /path/to/project \
  --query '当前需求' \
  --source-root frontend-platform=/absolute/path
```

目录不存在或搜索失败时会降级，不会编造能力。

## 开发验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s plugins/ai-talk/skills/ai-talk/tests -v
node --test plugins/ai-talk/skills/ai-talk/tests/test_build_capability_index.mjs
```

第一版人工验收用例见 [acceptance-cases.md](plugins/ai-talk/tests/acceptance-cases.md)。
