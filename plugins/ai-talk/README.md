# AI Talk Plugin

AI Talk 将自然语言研发需求整理成必须经过用户审查的 Codex 任务话术。它读取有限项目上下文，自动采用明确能力，只在组件或复用方式存在歧义时让用户选择，但不执行代码、不替代 Codex Plan，也不维护模板管理系统。

## 第一版流程

```text
理解任务 → 补充必要上下文 → 搜索并自动采用明确能力
→ 有歧义时用户选择 → 生成话术
→ ready_for_review → 用户确认 → confirmed → 可交给 Codex
```

所有新任务的 `requires_user_review` 为 `true`。开发、接入或修复类表达只会把期望处理方式识别为 `modify_and_verify`，不会授权 AI Talk 修改代码。

## 统一上下文

```bash
python3 skills/ai-talk/scripts/collect_context.py \
  --root /path/to/project \
  --query '帮我根据截图开发一个独立榜单页面' \
  --related src/pages/rank.vue
```

输出 `task_context`，包含：

- `task.scenes`：五类核心场景，可同时命中多个。
- `task.handling_mode`：`analyze / plan / modify_and_verify / review`。
- `task.status`：`draft / ready_for_review / confirmed / revise`。
- `task.requires_user_review`：始终为 `true`。
- 项目类型、包管理器、scripts、Git 状态和相关路径。
- 自动采用能力、歧义候选及用户选择。

只有用户明确确认后才传入 `--task-action confirm`。用户要求调整时使用 `--task-action revise`；重新生成使用 `--task-action regenerate`。AI Talk 本身仍不执行代码。

## 能力候选

`build-capability-index.mjs` 通过一次受限索引发现并分类 Skill、Prompt、项目规则、组件、utility 和同类实现。AI Talk 不再额外打开候选业务源码、消费者、测试或同类页面。能力包含名称、类型、来源、索引路径、匹配原因、发现状态、`selection_status`、`usage_preference`、`selection_source`、`choice_reason`、待验证内容、潜在风险、`user_choice` 和 `execution_validation`。

主 Skill、项目规则、适用 Prompt、唯一项目组件/utility/历史实现进入 `automatic`；共享能力或同类型多项竞争进入 `choice_required`。没有未选项时任务直接进入 `ready_for_review`，只有未解决歧义才进入 `draft`。

用户选择通过可重复参数写入：

```bash
--capability-choice <id>=prefer_reuse
--capability-choice <id>=prefer_reference
--capability-choice <id>=excluded
```

`user_choice` 初始为 `null`。`execution_validation` 在 AI Talk 阶段始终为 `null`，只有 Codex 实际验证后才能更新。

## 安全边界

- 不扫描 `.env`、密钥、`node_modules` 或构建产物。
- 不递归注入整个项目。
- 相关路径不存在、公司目录缺失或索引失败时返回 warning 并继续。
- 不编造 Skill、组件、路径、接口字段或兼容性结论。
- AI Talk 阶段只允许运行一次 `collect_context.py`，不额外定位分支、读取业务源码、运行测试或分析根因。
- 进入 `ready_for_review` 后停止读取业务代码、运行命令和修改文件。

## 第一版范围

重点支持 Bug 定位、UI/截图还原、多语言迁移、接口联调、新页面或新模块。代码清理、测试补充、返工模板和技术讨论不是第一版核心流程，不作为验收门槛。

不提供独立 UI、MCP App、模板后台、导入导出、云同步、团队账号、插件市场、完整 Git 审计或复杂数据看板。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/ai-talk/tests -v
node --test skills/ai-talk/tests/test_build_capability_index.mjs
```

人工新线程验收见 `tests/acceptance-cases.md`。
