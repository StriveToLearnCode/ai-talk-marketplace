# AI Talk Plugin

AI Talk 将自然语言研发需求整理成只包含有来源事实、可直接交给 Codex 的任务话术。纯文案、语法和机械修改走 `direct`；新增交互、展示能力或业务逻辑时先从项目 `.agents/skills` 选择执行 Skill；其他组件选型、能力复用、接口契约或关键项目事实按需发现。

AI Talk 不执行最终开发任务，不修改业务代码，也不提供任务确认卡或伪按钮。

AI Talk 生成的话术默认要求后续 Codex 直接修改并验证；`plan` 只在用户明确要求先给方案时使用。

## 工作流

```text
理解需求
→ direct：零项目命令、零额外 Skill，直接生成
→ 新增 UI/业务行为：轻量发现 .agents/skills 中的执行 Skill
→ 其他 discovery：按需选择专用 Skill 或项目本地索引
→ 组件需求优先检索公司封装组件
→ 确定则采用，存疑则展示最多 3 个候选
→ 区分用户事实、项目事实、检索事实和阻塞性未知
→ 生成任务话术
```

## 快速路径

纯文案、语法或变更方式明确的机械修改，AI Talk 只根据当前输入和完整对话生成话术。普通 Bug 定位和简单代码 review 在信息充分时同样直接生成。

快速路径不读取项目文件、目标文件或 reference，不运行 `collect_context.py`，不调用其他 Skill，也不生成未经读取的项目事实。简单请求以一次响应、15 秒内完成为目标。

用户用“需要奖励预览”“这里增加一个入口”等方式新增交互、展示能力或业务逻辑时，按 `modify_and_verify` 处理并先执行项目 Skill 轻量路由。项目中可读取的数据源、调用方式和组件 API 由所选执行 Skill 在实施时确认，不作为只给方案的理由。

## 项目 Skill 路由

```bash
node skills/ai-talk/scripts/build-capability-index.mjs \
  --root /path/to/project \
  --skills-only \
  --intent modify_and_verify \
  --skill-limit 10 \
  --query '这部分需要奖励预览'
```

项目 Skill 只从 `.agents/skills` 读取。Skill 候选有独立上限，不会被组件、模板或历史实现挤出。局部 UI/逻辑修改的最终话术应指定匹配到的 `$<skill-name>`、`local-patch + incremental`、直接修改和验证，并要求下游 Skill 查询 `docs/knowledge/component-registry.md` 和真实组件文档后优先复用已有能力；AI Talk 不预设具体组件。

## 本地上下文

本地索引只在 `discovery` 确实需要项目事实或复用候选时运行：

```bash
python3 skills/ai-talk/scripts/collect_context.py \
  --root /path/to/project \
  --query '查找可复用的奖励弹窗实现' \
  --related apps/short/current-activity
```

脚本 JSON schema 保持兼容。完整索引扫描项目根目录和显式 `--source-root`；项目 Skill 候选单独来自 `.agents/skills`，不会扫描 `.claude/skills`、用户 Skill 目录或插件缓存。

## 公司组件检索

- 不预设 Skill 或组件名称，只根据用户事实和已有项目事实检索。
- 公司组件 Skill 是首选发现来源，不默认同时运行项目本地索引。
- 唯一明显最佳结果可直接采用，但仍要求后续验证兼容性。
- 多个结果接近时最多展示 3 个候选，每项只显示组件名称和匹配原因。
- 没有合适公司组件时，让用户选择检查当前项目或新建本地组件，不自动降级。

## 事实边界

- `direct` 只使用用户事实，不补充技术栈、文件内容或项目规范。
- `discovery` 读取的项目事实必须直接相关并带来源。
- 组件支持某项能力不代表用户要求该能力。
- 非阻塞缺失项省略；用户未明确时不生成验收标准。

## 输出

AI Talk 输出一屏任务摘要、一个完整任务话术代码块，以及：

```text
任务话术已生成，当前尚未执行代码修改。
```

## 安全边界

- AI Talk 不运行 formatter、lint、测试、构建、开发服务器、部署或提交。
- 被调用 Skill 只执行与当前任务有关的只读发现步骤。
- 不读取 `.env`、密钥、依赖目录和构建产物。
- 不把发现结果写成兼容性结论或用户未提出的业务需求。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/ai-talk/tests -v
node --test skills/ai-talk/tests/test_build_capability_index.mjs
```

人工新线程验收见 `tests/acceptance-cases.md`。
