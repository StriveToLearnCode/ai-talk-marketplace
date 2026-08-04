---
name: ai-talk
description: 用于每一轮用户对话的可见分流，以及复杂研发任务的证据交接。每个用户回合都必须调用且只调用一次：简单任务、普通问答、状态、AI Talk 元讨论、反馈和只有引用而无当前请求的消息显示“AI Talk：跳过”；多断点诊断、诊断转修复、跨模块或长任务续接、范围受限修改及外部写入显示“AI Talk：介入”，并保留目标、范围、证据和授权。
---

# AI Talk v0.6 Visible Gate and Evidence Handoff

AI Talk 不负责让 Agent 更聪明，而是让复杂研发任务可控、可验证、可续接。每个用户回合只用当前请求、已有对话和活动任务状态分流一次；分流前不读 reference、不检索仓库、不生成契约、不调用 reporter。正常任务不得扫描本 Skill 目录或读取 `tests/`；只在本文件的明确条件满足时读取指定 reference。测试夹具只用于维护和验证本 Skill。

## 逐轮可见状态

每个用户回合必须调用本 Skill 一次，并在该回合第一条可见助手回复的首行输出且只输出一个状态：未实质介入时输出 `AI Talk：跳过`；进入诊断简报、修改对账、目标或范围锁定、外部写入控制等流程时输出 `AI Talk：介入`，可在同一行附一个简短原因。若该回合需要工具，状态放在第一条进度更新；若直接回答，状态放在最终回复。该回合后续进度更新和最终回复不得重复状态行。状态行只表示本轮路由结果，不构成贡献归因。

## 三档分流

1. `简单任务`：明确单点排查或局部可逆修改立即 `skip`，不创建活动状态或契约，不读 reference，不调用 validator/reporter，不询问；普通问答、状态、元讨论、反馈和只有引用而无当前请求的消息同样放行。所有这些回合仍按“逐轮可见状态”输出 `AI Talk：跳过`。
2. `诊断任务`：只有需要在多个可证伪断点间定位原因时使用 `inspect_only + DiagnosticBrief`。日志、堆栈、测试输出和新检查结果只更新已有证据，不扩大目标、范围或权限。
3. `修改任务`：复杂修改使用 `modify_and_verify + authorized` 并执行修改前后对账；后续“继续/执行”和新证据继承活动任务，不重新分析。本地授权绝不推导为外部授权。

## 诊断简报

`DiagnosticBrief` 只保存在活动任务状态，固定包含 `target`、`expected`、`observed`、`facts`、`hypotheses`、`conclusions`、`verification`、`stop_when`。`fact` 必须有可复核来源；`hypothesis` 必须可证伪且保持未验证；`conclusion` 必须引用直接证据，不得把用户猜测、源码推断或未观察的运行态升级为结论。验证按最短证据链排序，在首个有直接证据的断点停止。

用户随后要求“修一下/执行”时继承目标、事实、假设、结论、断点与已完成检查，只补本地修改授权和变更锁定；不得重新分类、广泛检索或重复已完成检查。

## 修改前后对账

首次写入前锁定 `ChangeBrief`：`target_behavior`、`write_scope`、`excluded_scope`、`acceptance`。目标多义、多文件/多模块/多外部系统或复杂时序、bounded/excluded scope、产品或数据语义、活动状态冲突、验收不明或非单目标外部写入时，读取 `references/requirement-contract.md` 创建或修订 `RequirementContract 1.5`，按需读取 `references/target-binding.md` 和 `references/execution-protocols.md`，并运行 `scripts/contract-check.mjs validate`。精确可回读的 Pagecenter 保存保持轻量；正式发布、删除或破坏性覆盖、Git push、发送消息必须在列清影响后接受紧邻确认。

完成修改后必须按普通任务终态输出 `CompletionReconciliation` 的自然语言结果：实际改动、每条验收的 `passed/failed/unverified` 与证据、是否超出原范围、未验证项、仍为假设的结论。验收先转为有限证据清单，全部可观察项达成后立即停止；环境无法展示的客户端 SDK 画面标记“真机未验证”，不继续绕查替代弹层。不得显示内部结构、路由、契约、YAML、品牌化对账或思维链。

首次本地写入前保留用户已有 staged、unstaged、untracked 和 stash 状态。只读文件数和工具数不是升级理由，多文件写入是；真实风险出现后在首次越出轻量边界的写入前升级并保留已有证据，只有产品结果、写范围或新增外部授权确需决定时才问一个问题。

## Legacy CLI

仅在维护旧版公司 Skill 路由兼容层时读取 `references/legacy-router.md` 并运行 `scripts/route-company-skills.mjs`。正常 AI Talk 对话不得读取或执行该兼容层。
