# AI Talk

AI Talk 是一个 Codex 插件，用于实际调用适用的项目或公司 Skill 做只读能力发现，并把自然语言研发需求整理成可直接交给 Codex 的任务话术。

AI Talk 不执行最终任务、不修改业务代码，也不提供确认卡或伪交互按钮。

核心流程：

```text
用户自然语言
→ 从当前 Available Skills 选择专用 Skill
→ 完整读取并执行只读发现流程
→ 组件需求先检索公司封装组件
→ 确定则采用，存疑则展示最多 3 个候选
→ 无公司组件时由用户选择检查项目或新建本地组件
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

第一版重点支持 Bug 定位、UI 或截图还原、多语言迁移检查、接口联调、新页面或新模块开发。

```text
$ai-talk 开发一个带二次确认和加载状态的操作入口，并整理成开发任务话术
$ai-talk 轮播图偶尔不切换，先帮我看看，不要修改代码
$ai-talk 根据接口文档接入奖励接口，不要编造字段
```

## Skill 调用

当前 Codex 会话提供的 Available Skills 是权威来源。AI Talk 根据 Skill 描述的完整语义选择最小适用集合：

- 专用组件目录、物料平台、活动开发或接口契约 Skill 优先。
- `frontend-dev-coach` 等通用 Skill 不会因为“开发、修改、验证”等常见词覆盖专用 Skill。
- 命中的 Skill 必须完整读取并执行只读发现流程，不能只把 Skill 名称写进任务话术。
- 组件需求不预设 Skill 或组件名称，只用需求、项目技术栈和使用场景检索公司封装组件。
- 唯一明确结果直接采用；存在不确定性时最多展示 3 个组件名称和匹配原因。
- 没有合适公司组件时明确提示，并让用户选择检查当前项目已有实现或新建本地组件。

## 公司组件流程

公司组件候选与项目本地候选分阶段处理。公司检索阶段运行本地上下文脚本时增加 `--defer-project-component-choice`，项目组件不会混入公司候选或阻塞话术状态。用户选择检查项目后，才取消延迟并启用本地组件候选。

推荐确定不等于兼容性已验证。最终话术始终要求后续 Codex 读取真实代码并检查 props、事件、数据结构、依赖、配置和样式覆盖。

## 期望处理方式

AI Talk 识别的是后续 Codex 的期望处理方式，不是当前执行授权：

| 用户表达 | 期望处理方式 |
| --- | --- |
| “帮我看看”“先定位”“不要改” | `analyze`，只分析 |
| “先给方案”“讨论方案” | `plan`，先给方案 |
| “帮我开发”“接入”“修复” | `modify_and_verify`，修改并验证 |
| “审查代码” | `review`，只审查 |

## Prompt 状态

- `draft`：仍有阻塞问题或真实复用歧义。
- `ready`：信息足够，可以生成话术。

不存在确认、调整、取消或自动移交状态。用户后续要求修改话术时，AI Talk 根据完整对话重新生成。

## 能力复用

AI Talk 的本地索引只搜索项目根目录和显式 `--source-root` 中的项目规则、组件、utility、Prompt、历史实现和未注册 Skill，不扫描用户 Skill 目录或插件缓存。

- `prefer_reuse`：要求后续 Codex 优先验证复用。
- `prefer_reference`：仅作参考。
- `excluded`：本次排除。

选择候选不代表兼容。只有后续 Codex 实际读取代码后才能给出 `confirmed_reuse`、`partial_reuse`、`incompatible` 或 `reference_only`。

## 最终输出

AI Talk 输出任务摘要、完整任务话术和以下事实说明：

```text
任务话术已生成，当前尚未执行代码修改。
```

## 公司能力目录

公司目录不硬编码。明确知道目录时可传给本地索引：

```bash
python3 plugins/ai-talk/skills/ai-talk/scripts/collect_context.py \
  --root /path/to/project \
  --query '当前需求' \
  --source-root frontend-platform=/absolute/path \
  --defer-project-component-choice
```

## 开发验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s plugins/ai-talk/skills/ai-talk/tests -v
node --test plugins/ai-talk/skills/ai-talk/tests/test_build_capability_index.mjs
```

人工验收用例见 [acceptance-cases.md](plugins/ai-talk/tests/acceptance-cases.md)。
