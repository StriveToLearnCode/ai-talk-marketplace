# AI Talk Plugin

AI Talk 自动匹配研发请求，并提供统一的三段式体验：开始前锁定需求，执行中守住边界，完成后逐项对账。状态、纯引用和非研发消息原样放行；Strict Mode 仅作为确保逐轮触发的高级选项，不改变任务行为。

运行规则：

1. Fast Path 修改任务开始时只显示 `AI Talk · 目标明确，直接执行`，不增加协议读取或工具调用。
2. 只分析、原因定位、前后端归属和纯缺陷陈述保持 `inspect_only`，显示只读提示；用户随后说“执行”时复用证据转入实施。
3. `entry_point` 只保存用户标注入口；`control_point`、本地 `write_scope` 和外部 `external_write_scope` 分别校验，空本地范围不授权外部变更。
4. 当前上下文已有新鲜、唯一视觉证据时使用 `light_binding` 进入 Fast Path；不读 reference、不调用浏览器或仓库工具、不持久化 `target_refs`。
5. 轻量证据缺失、陈旧或多义时才进入视觉契约；视觉绑定保持只读，敏感 URL 参数必须移除。
6. 契约路径的截图标注、选中 DOM 和当前浏览器页面写入稳定 `target_refs`，不与根因 evidence 混用。
7. Contract Path 校验后、实施前最多显示目标、边界、验收三项，不暴露 route、authorization、YAML 或 validator 输出。
8. 帮助度反馈与反馈偏好不进入 Skill；安装后的 Stop Hook 或宿主适配器只处理带契约任务 ID、contract 路由和终态 outcome 的任务。
9. 每个 `modify_and_verify` 终态回复使用 `AI Talk 对账` 逐项目标，并区分真实运行验证、静态检查和未验证项。
10. 有禁止范围或 `bounded` 写范围时，使用 `scripts/scope-guard.mjs` 比较本轮前后变化并拦截越界文件。
11. 契约创建或修订后，必须运行 `skills/ai-talk/scripts/contract-check.mjs validate`；它确定性检查结构、真实文件与行号、视觉证据形状和范围冲突，失败时不得交接。
12. Fast Path（包括 `light_binding`）永不触发 contract checker 或 reporter。可选项目 Hook 处理契约任务抽样和显式错误的脱敏元数据；只有配置 HTTPS 端点且设置 `AI_TALK_FEEDBACK_CONSENT=1` 才远端发送。
13. 文件行号、IDE 选区、唯一业务 ID、已绑定 DOM 或截图标注能够唯一确定目标时，指代词不单独触发契约。
14. 正常对象与异常对象的对比属于只读缺陷证据；明确说“修复”或给出直接目标行为才授权本地修改。裸日志只恢复同一任务的验证或诊断。
15. 外部写入提议已列清系统、单一动作和每个目标时，用户紧接回复“是的/确认/执行”即修订契约并继续；不要求复述固定句式，也不从多选或不完整提议推导授权。

```text
这里的第二个头像也加上同样的动效
```

若当前 DOM 选择可以唯一定位该头像，AI Talk 直接保存稳定 selector、1-based ordinal、DOM fingerprint 和匹配的浏览器状态；不会要求用户重新描述，也不会把选中节点直接当作代码修改点。

安装后用户只需正常描述研发需求。需要确保逐轮触发时，运行 `node scripts/install-strict-mode.mjs --project /绝对项目路径`，然后新建 Codex 任务；该选项不形成第二套用户体验。非研发对话不触发；`$ai-talk:...` 仅保留为兼容的显式调用方式。

`skills/ai-talk/scripts/route-company-skills.mjs` 与 `references/legacy-router.md` 仅用于 legacy CLI 兼容和历史测试。

`scripts/install-strict-mode.mjs` 只维护 `AGENTS.md` 中带标记的 AI Talk 区块，支持 `--check`、`--dry-run` 和 `--remove`，不会覆盖其他项目规则。反馈实现位于 `scripts/feedback-*.mjs`；Codex 不保证从插件或 Skill 自动发现 Hook。需要运行时反馈资格判断时，显式运行 `node scripts/install-feedback-hooks.mjs --project /绝对项目路径`，并由宿主提供 `ai_talk_task_id`、`ai_talk_route: contract` 与 `ai_talk_outcome`。
