# AI Talk Plugin

AI Talk 自动匹配研发请求，在对话内连续保存目标、授权、范围和证据，并按真实风险渐进升级。内部推理保持静默，实际介入结论可见；状态、纯引用和非研发消息原样放行，Strict Mode 仅提高逐轮触发覆盖率。

运行规则：

1. 纯 Fast Path `skip` 静默执行；每轮只读取主 `SKILL.md` 1 次，协议 reference 和 AI Talk 专用工具调用均为 0。`light_binding`、`DiagnosticBrief` 或有实质影响的状态复用可以显示一次决策摘要。
2. 只分析、原因定位和前后端归属保持 `inspect_only`；代码工作区中目标与预期明确、局部可逆且不涉及外部写入的纯缺陷陈述直接使用 `modify_and_verify + authorized`。其余缺陷保持只读，并从当前上下文零工具生成非持久化 `DiagnosticBrief`。
3. `entry_point` 只保存用户标注入口；`control_point`、本地 `write_scope` 和外部 `external_write_scope` 分别校验，空本地范围不授权外部变更。
4. 当前上下文已有新鲜、唯一视觉证据时使用 `light_binding` 进入 Fast Path；不读 reference、不调用浏览器或仓库工具、不持久化 `target_refs`。
5. 轻量证据缺失、陈旧或多义时才进入视觉契约；视觉绑定保持只读，敏感 URL 参数必须移除。
6. 契约路径的截图标注、选中 DOM 和当前浏览器页面写入稳定 `target_refs`，不与根因 evidence 混用。
7. Contract Path 在内部校验，不暴露 route、authorization、YAML、validator 输出或思维链；形成实际决策后用最多三行报告判断、依据和影响。
8. 帮助度反馈与反馈偏好不进入 Skill；安装后的 Stop Hook 或宿主适配器只处理带契约任务 ID、contract 路由和终态 outcome 的任务。
9. `modify_and_verify` 沿用普通终态表达，报告实际改动、真实运行验证、静态检查和未验证项；发生实际介入时增加一句可核验的 `AI Talk 贡献`，纯 `skip` 不归因。
10. 有禁止范围或 `bounded` 写范围时，使用 `scripts/scope-guard.mjs` 分别记录 staged、unstaged、untracked 和 stash，比较本轮内容与 index 变化并拦截越界或未恢复的工具 stash。
11. 契约创建或修订后，必须运行 `skills/ai-talk/scripts/contract-check.mjs validate`；它确定性检查结构、真实文件与行号、视觉证据形状和范围冲突，失败时不得交接。
12. Fast Path（包括 `light_binding`）永不触发 contract checker 或 reporter。可选项目 Hook 处理契约任务抽样和显式错误的脱敏元数据；只有配置 HTTPS 端点且设置 `AI_TALK_FEEDBACK_CONSENT=1` 才远端发送。
13. 文件行号、IDE 选区、唯一业务 ID、已绑定 DOM 或截图标注能够唯一确定目标时，指代词不单独触发契约。
14. 正常对象与异常对象的对比若能明确绑定局部代码目标和预期、改动可逆且不涉及外部写入，则授权本地修复；目标或预期不明、显式诊断、仅有证据或涉及生产与外部系统状态时保持只读。裸日志只恢复同一任务的验证或诊断，不扩大行为、范围或外部授权。
15. 视觉诊断先把参考设计与实际状态转为带来源的最小差异；事实、推断与 `runtime_unverified` 分开，数据驱动 UI 默认按渲染条件、映射字段、实际响应、服务端注入逐段验证，在首个直接证据断点停止。
16. 用户随后说“修一下/执行”时复用同一目标已确认的证据，只补实施授权；已定位为局部改动时继续 Fast Path，仍跨模块、受限或涉及外部写入时才升级契约。
17. 外部写入提议已列清系统、单一动作和每个目标时，用户紧接回复“是的/确认/执行”即修订契约并继续；同一活动任务只复用完全相同的授权项，不从日志、多选、不完整提议或旧任务推导授权。
18. Fast Path 调查后发现跨模块行为、数据语义、范围限制、专用流程或外部写入风险时，在首次扩大边界的写入前升级、保留证据并说明升级的判断、依据和影响；仅增加相邻实现、类型或测试文件时不中断，确需扩大权限或决定产品结果时只问一个问题。

```text
这里的第二个头像也加上同样的动效
```

若当前 DOM 选择可以唯一定位该头像，AI Talk 直接保存稳定 selector、1-based ordinal、DOM fingerprint 和匹配的浏览器状态；不会要求用户重新描述，也不会把选中节点直接当作代码修改点。

安装后用户只需正常描述研发需求。需要确保逐轮触发时，运行 `node scripts/install-strict-mode.mjs --project /绝对项目路径`，然后新建 Codex 任务；该选项不形成第二套用户体验。非研发对话不触发；`$ai-talk:...` 仅保留为兼容的显式调用方式。

`skills/ai-talk/scripts/route-company-skills.mjs` 与 `references/legacy-router.md` 仅用于 legacy CLI 兼容和历史测试。

`scripts/install-strict-mode.mjs` 只维护 `AGENTS.md` 中带标记的 AI Talk 区块，支持 `--check`、`--dry-run` 和 `--remove`，不会覆盖其他项目规则。反馈实现位于 `scripts/feedback-*.mjs`；Codex 不保证从插件或 Skill 自动发现 Hook。需要运行时反馈资格判断时，显式运行 `node scripts/install-feedback-hooks.mjs --project /绝对项目路径`，并由宿主提供 `ai_talk_task_id`、`ai_talk_route: contract` 与 `ai_talk_outcome`。
