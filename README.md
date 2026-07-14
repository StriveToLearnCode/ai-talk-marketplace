# AI Talk

AI Talk 是一个只生成研发任务提示词的 Codex 插件。它不会执行提示词中的任务。

纯文案、语法和明确机械修改直接生成；新增交互、业务逻辑或测试任务时，最多运行一次 `.agents/skills` frontmatter 索引来选择后续执行 Skill。AI Talk 不读取业务文件、下游 Skill 正文、Figma、飞书或浏览器，也不修改代码和运行测试。

```text
用户自然语言
→ direct：零命令直接整理
→ discovery：一次 frontmatter-only Skill 索引
→ 把 $skill-name 和执行顺序写入 text 代码块
→ 输出提示词并立即停止
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

```text
$ai-talk 修改 src/page.vue 中的错误语法，保留业务逻辑
$ai-talk 这部分需要奖励预览，完成后补目标范围测试
$ai-talk 审查 src/utils/reward.ts，只审查不要修改
```

## 纯提示词模式

- `direct` 不运行任何项目命令。
- `discovery` 只运行一次 `build-capability-index.mjs --skills-only`。
- 索引只使用 `.agents/skills/**/SKILL.md` 的 `name` 和 `description` frontmatter，不读取正文。
- 不运行 `collect_context.py`，不搜索组件、模板、历史实现或项目规则。
- 不调用 `$gen-code`、`$ai-test` 或其他 Skill；这些名称只出现在 fenced `text` 代码块中。
- 不访问目标文件、Figma、飞书、Chrome、接口文档或网络。
- 输出“任务话术已生成，当前尚未执行代码修改”后立即停止。

功能开发与测试同时存在时，提示词安排后续 Codex 先执行代码 Skill，再执行测试 Skill。例如候选为 `gen-code` 和 `ai-test` 时：

```text
1. 使用 $gen-code，以 local-patch + incremental 模式完成目标范围功能并验证。
2. 功能完成后使用 $ai-test，仅生成或执行目标范围测试。
```

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s plugins/ai-talk/skills/ai-talk/tests -v
node --test plugins/ai-talk/skills/ai-talk/tests/test_build_capability_index.mjs
```

人工验收用例见 [acceptance-cases.md](plugins/ai-talk/tests/acceptance-cases.md)。
