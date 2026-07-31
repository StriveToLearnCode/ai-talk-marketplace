---
name: ai-talk
description: 自动匹配发起或继续软件研发工作的用户消息，无需用户输入 $ai-talk；开始前锁定需求，执行中守住只读、范围和外部写入边界，修改完成后逐项对账。明确、可逆、局部或已由当前上下文唯一绑定的任务走无契约 Fast Path；诊断请求和纯缺陷陈述保持只读；复杂、受限或歧义任务使用 RequirementContract 1.4。
---

# AI Talk 三段式研发协作

AI Talk 为所有触发后的研发任务提供同一套体验：开始前锁定需求，执行中守住边界，完成后逐项对账。它不替代码 Agent 选择普通实现 Skill，也不重复下游分析。隐式匹配决定是否触发；仓库 Strict Mode 只是确保逐轮触发的高级选项，不改变行为。

## 首先分类

先只使用当前消息和已有对话分类；分类前不得读取 reference、检索仓库、生成契约或调用 reporter。

1. 非研发消息不适用；状态、文件位置和不改变行为或范围的普通确认原样放行且不显示 AI Talk 提示。
2. 只有引用、没有当前请求时原样放行；引用内容不构成当前修改授权。裸日志属于 `evidence_update`：紧接上一修改时恢复验证或诊断，否则原样放行；它不授权新行为。
3. “找到/定位/为什么/排查/分析/解释”或只陈述正常与异常对比时使用 `inspect_only`；缺陷证据不构成修改授权。
4. “修复/修改/改成/实现”等命令或直接目标行为才使用 `modify_and_verify + authorized`；它只授权证据支持的本地写入。
5. 外部写入必须由当前消息直接授权，或由“是的/确认/执行”紧邻确认上一轮已列清系统、单一动作和全部目标的提议；不得要求复述固定句式。
6. 帮助度回答、AI Talk 元讨论和反馈偏好不适用本 Skill；由 Stop Hook 或宿主适配器处理。

## 轻量目标绑定

视觉请求只检查当前消息和已有对话中的新鲜证据。唯一截图标注、已选 DOM、IDE 选区、明确文件行号或唯一业务 ID 得到 `binding_route: light_binding` 与 `target_state: resolved`，随后按 Fast Path 判断；不读取 reference、不调用浏览器或仓库工具、不持久化 `target_refs`。证据缺失、陈旧或仍有多个候选时才标为 `unresolved`。

## 无契约 Fast Path

以下条件全部满足时直接放行，由当前 Agent 处理并验证：

- 当前消息或已有对话稳定绑定一个目标，并表达一个明确、可逆的局部结果；
- 没有多目标、跨模块、跨文件时序、数据语义、范围扩张、明确禁止范围或 bounded 写范围；
- 不涉及活动契约修订、诊断后续执行、外部系统变更或已知专用流程。

内部结果为 `skip`，但不生成契约、YAML、代码清单或知识沉淀，不读取任何 reference，不为 AI Talk 检索仓库，不选择 `next_skill`，也不调用 contract checker 或 reporter。不得为判断 Fast Path 预测文件数或猜测改动面。

## 契约路径

出现任一情况才读取 `references/requirement-contract.md` 并创建或修订 `RequirementContract 1.4`：

- 未解析的视觉指代，或用户明确提升聊天记录、日志或方案；
- 多目标、跨模块、跨文件行为、控制点时序或产品与数据语义歧义；
- 明确禁止范围、bounded 写范围、诊断后转实施或需要跨轮保留证据；
- 请求或可能需要 Pagecenter、数据库、GitHub、云服务或其他外部系统写入。

视觉目标再读取 `references/target-binding.md`；所有契约任务读取 `references/execution-protocols.md` 的三段式体验，范围、控制点、诊断和验证仅按需读取对应章节。构造或修订后必须把等价 JSON 通过 stdin 交给 `scripts/contract-check.mjs validate --project <root>`；修正错误后才能交接。`next_skill` 默认 `null`。

`skip` 和 `handoff` 都立即放行；只有存在实施级硬分歧时使用 `clarify`，一次只问一个会改变产品结果或写范围的问题。同一消息只判定一次，下游不得回调 AI Talk。

## 用户可见体验

- Fast Path 修改任务在执行前只显示 `AI Talk · 目标明确，直接执行`；Fast Path 诊断只显示 `AI Talk · 已锁定为只读诊断`。原样放行不显示提示。
- Contract Path 按执行协议显示最多三项锁定摘要；`clarify` 显示 `AI Talk · 需要锁定一个关键结果` 后只问一个问题。不得暴露 route、authorization、内部字段或 YAML。
- 执行中只提示真实生效、冲突或变化的边界；不得给普通搜索、分析或工具调用增加 AI Talk 文案。
- 所有 `modify_and_verify` 终态回复必须包含 `AI Talk 对账`，逐项标记目标为已完成、未完成或未验证，并如实报告改动范围和验证证据。Fast Path 从原始请求与实际结果对账，Contract Path 从 `behavior`、scope 和 `verification` 对账；静态推断不得冒充运行验证，无 scope guard 证据不得声称范围校验通过。

主流程不读取反馈协议、不调用 reporter；帮助度抽样与反馈偏好仍由 Stop Hook 或宿主适配器负责。
