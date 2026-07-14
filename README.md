# AI Talk

AI Talk 是一个 Codex 插件，用于把自然语言研发需求整理成只包含有来源事实、可直接交给 Codex 的任务话术。

纯文案、语法、明确机械修改等简单请求直接生成话术。新增交互、展示能力或业务逻辑时，先从项目 `.agents/skills` 轻量选择执行 Skill，再生成要求 Codex 直接修改并验证的话术。其他组件选型、能力复用、接口契约或关键项目事实按需发现。AI Talk 不执行最终任务、不修改业务代码，也不提供确认卡或伪交互按钮。

生成的话术默认要求 Codex 直接修改并验证。只有用户明确要求“先给方案”“只分析”或“只审查”时，才不会进入执行型任务。

核心流程：

```text
用户自然语言
→ 判断 direct / discovery
→ direct：只保留用户事实并立即生成话术
→ 新增 UI/业务行为：从 .agents/skills 轻量选择执行 Skill
→ 其他 discovery：按需选择专用 Skill 或项目本地索引
→ 组件需求优先检索公司封装组件
→ 区分用户事实、项目事实、检索事实和阻塞性未知
→ 生成最终任务话术
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
$ai-talk 修改 src/page.vue，把模板恢复为 Vue 3 HTML 写法，保留现有业务逻辑
$ai-talk 轮播图偶尔不切换，先整理成定位任务，不要修改代码
$ai-talk 开发一个普通弹窗，不要补充我没有说过的功能
$ai-talk 根据现有接口文档接入奖励接口，不要编造字段
```

## 快速路径

目标、修改要求和边界已明确时走 `direct`：

- 不读取项目文件或项目规则。
- 不运行 `collect_context.py`。
- 不读取场景 reference，不调用其他 Skill。
- 不补充未经读取的技术栈、文件内容或项目约束。
- 一次响应直接生成话术，简单任务目标耗时为 15 秒内。
- 纯文案、语法和明确机械修改保持零项目命令。

明确的机械代码修改、Bug 定位和简单 review 都可走快速路径。路径、Bug、截图、接口或开发等关键词本身不会触发发现；新增交互、展示能力或业务逻辑除外。

## 按需发现

以下情况进入 `discovery`：新增交互、展示能力或业务逻辑，组件选型或复用，用户明确要求检索现有能力，任务必须引用尚未提供的权威契约或项目事实，或只读发现可以解决方向性歧义。

新增 UI 或业务行为先运行 Skill-only 索引，只读取项目 `.agents/skills`：

```bash
node plugins/ai-talk/skills/ai-talk/scripts/build-capability-index.mjs \
  --root /path/to/project \
  --skills-only \
  --intent modify_and_verify \
  --skill-limit 10 \
  --query '这部分需要奖励预览'
```

Skill 候选独立于普通能力上限。局部修改应选择支持代码生成、局部输入或加逻辑的执行 Skill；最终话术写明 `$<skill-name>`、`local-patch + incremental`、直接修改和验证，并要求该 Skill 查询项目组件注册表。AI Talk 不硬编码具体公司组件，也不把执行请求改成方案任务。

- 优先选择一个直接提供所需事实的专用 Skill 或项目本地索引，不默认两者都执行。
- 公司组件需求先调用语义匹配的公司组件 Skill，不预设组件名。
- 唯一明确结果直接采用；多个结果接近时最多展示 3 个组件名称和匹配原因。
- 没有合适公司组件时，让用户选择检查当前项目已有实现或新建本地组件，不自动降级。
- 只有第一种来源不足且第二种来源能直接解决阻塞时，才继续发现。

## 严格事实模式

AI Talk 只允许用户明确内容、直接相关且带来源的项目事实、实际返回的检索事实和阻塞性未知进入话术。组件支持的能力不等于用户需求；非阻塞缺失项直接省略，用户未明确时不生成验收标准。

## 输出

AI Talk 输出任务摘要、完整任务话术和以下事实说明：

```text
任务话术已生成，当前尚未执行代码修改。
```

## 开发验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s plugins/ai-talk/skills/ai-talk/tests -v
node --test plugins/ai-talk/skills/ai-talk/tests/test_build_capability_index.mjs
```

人工验收用例见 [acceptance-cases.md](plugins/ai-talk/tests/acceptance-cases.md)。
