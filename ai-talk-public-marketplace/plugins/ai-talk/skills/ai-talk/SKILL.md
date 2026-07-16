---
name: ai-talk
description: 在用户显式调用 $ai-talk 时，将研发需求和真实附件整理为最小 Task Contract，识别会影响业务结果、修改范围或实现方向的 Context Gap。只描述缺口并建议后续来源，不搜索项目、不读取公司 Docs、不调用下游 Skill、不规划检索顺序，也不扩展用户需求。
---

# AI Talk Context Gap 标注器

保留用户原始目标，从用户原话、真实附件和编辑器已提供的上下文中提取已确认事实、研发概念、关系与冲突，并输出供后续 Codex 自行检索和执行的 Task Contract。

## 执行流程

1. 原样保留用户目标；只移除 `$ai-talk` 调用标记。
2. 运行一次 `scripts/route-company-skills.mjs`。附件按真实内容传入重复的 `--evidence-type`：
   - `visual=<附件摘要>`
   - `interaction=<附件摘要>`
   - `api=<附件摘要>`
   - `screenshot=<附件摘要>`
   - `selected_code=<选中内容摘要>`
3. 使用脚本默认文本作为最终 Task Contract。只有调试和测试可以增加 `--debug-json`。
4. 生成 Task Contract 后停止。不要搜索项目、读取公司 Docs、调用 Skill、安排检索顺序或开始实施。

```bash
node scripts/route-company-skills.mjs \
  --query '<用户原始输入>' \
  [--evidence-type 'visual=视觉稿摘要']
```

历史参数 `--root`、`--source-root`、`--exclude-root`、`--limit` 和 `--top-k` 仅为调用兼容而接受，必须忽略，不得据此读取文件或建立 Skill 索引。

## 支持的任务类型

- `feature_create`：重点判断 `target_scope`、`expected_behavior`；仅在需求实际依赖时判断 `visual_reference`、`interaction_rule`、`data_source`。
- `bug_fix`：重点判断 `issue_symptom`、`target_scope`；仅在问题实际涉及对应信息时判断 `expected_behavior`、`reproduction_condition`、`state_mapping`。
- `ui_modify`：重点判断 `target_scope`、`visual_change`；仅在修改实际依赖时判断 `state_condition`、`asset_resource`。
- `ui_inspection`：重点判断 `page_entry`、`inspection_goal`。
- `planning`：重点判断 `goal`、`scope`。

不得把设计稿、接口、目标文件或测试设为所有任务的固定必填项。

## 结构化结果

调试结果包含：

```yaml
original_goal: 用户原始目标
intent: feature_create | bug_fix | ui_modify | ui_inspection | planning
confirmed_context:
  - type: 上下文类型
    value: 已确认信息
    source: user_text | user_text:path | attachment:<序号>
entities: 带 value、label、source 的研发概念
relationships_and_conflicts:
  - 已确认信息之间的关系、冲突或待验证关系
unknowns:
  - type: 缺口类型
    reason: 缺失信息为何会影响任务
    blocking: true | false
    suggested_source: project | docs | skill | user
boundaries:
  - 任务边界
acceptance_criteria:
  - 验收标准
```

每个 `unknowns` 项只能包含 `type`、`reason`、`blocking` 和可选的 `suggested_source`。

## Context Gap 判断

- 用户原话、真实附件或编辑器真实提供的信息已覆盖的内容不算缺口。
- `blocking=true` 只用于缺失信息会改变业务结果、修改范围或实现方向的情况。
- `blocking=false` 表示 Codex 可在执行阶段自行确认，不打断工作流。
- 最多生成一个阻塞缺口；没有真实缺口时返回空数组，不制造占位 unknown。
- 不输出固定“期望交付物尚未明确”。
- `icon/mask`、`icon/close`、`progress/bg-1` 等图片或图标标识属于 `asset_resource`，不是目录或 `target_scope`。
- 截图只能证明页面表现，不得直接当作接口数据、状态含义或代码实现事实。
- 状态值与页面表现冲突时，将 `state_mapping` 标为待验证关系，不直接推断状态值的业务含义。
- “开发一个弹窗”不得补充按钮、props、事件或样式。只有缺少 `target_scope` 确实导致无法确定修改位置时，才将其标为阻塞。
- AI Talk 只给出适合后续 Codex 理解的研发概念和缺口描述；不得生成检索计划、检索步骤或 Skill 选择。

## 默认 Task Contract

按以下顺序展示：

```text
用户目标：
<原始业务意图>

已确认上下文：
- <真实上下文>

研发概念：
- <可靠研发概念>

关系与冲突：
- <已确认关系、冲突或待验证关系>

上下文缺口：
- <缺口原因>
  建议来源：<当前项目代码 / 公司文档 / 相关 Skill / 用户确认>。
  <阻塞说明或非阻塞执行阶段验证说明>

任务边界：
- <真实任务边界>

验收标准：
- <基于用户原话的验收标准>
```

没有缺口时省略整个“上下文缺口”区域，不输出“上下文已足够”等固定套话。无法可靠提取的研发概念行直接省略。

默认输出禁止展示内部字段名、JSON、评分、绝对路径、固定“期望交付物尚未明确”、检索计划、检索步骤或执行 Skill。不要扩展用户未确认的功能、交互、组件、数据结构和验收要求。

旧 `--profile-json` 协议保持禁用。
