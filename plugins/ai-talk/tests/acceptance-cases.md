# AI Talk 验收场景

## A. 原话与增量上下文

`$ai-talk 在 banner-spin.vue 中，积分阶段 PROGRESS_TASK_ID: 7，然后一样展示进度和奖励`

- 用户原话保持不变，不生成新的任务目标。
- 只展示附件、代码或原话支持的高价值增量事实，最多 2 条。
- 同义改写不算增强内容。
- 保留一条 1～2 句的任务专属工程判断，不把可能原因写成根因。

## B. 公司检索入口

`$ai-talk 帮我开发一个弹窗组件模板，并一进入页面就开启。`

- 优先检索把弹窗模板结构、开关方式、首次进入生命周期和页面挂载方式直接映射到已证实入口。
- 只推荐实际读到且内容与目标结构一致的 `self-select-dialog.vue`、`onAfterInit` 和 `page.vue`，每项说明用途。
- 不预设 props、事件、按钮或业务逻辑。
- 建议检索最多 3 条，找不到真实入口时不显示该模块。
- 输入“不要复用现有实现，可以全局重构”时，删除冲突的复用和范围限制规则。

## C. 内部项目上下文

`$ai-talk 修复 src/feature/target.ts 中的显示问题`

- 读取目标文件和目标路径就近的 `AGENTS.md`，用于内部判断。
- 前台只展示与知识对象对应的最佳真实入口，不平铺 `AGENTS.md` 或普通直接依赖。
- 不读取无关兄弟文件，不递归目标目录，不读取 `node_modules`。
- 项目规则使用 `[项目]` 来源，并带真实 evidence。

## D. 读取边界

- 仓库外符号链接不得被读取，原因进入 Handoff 待确认。
- 文件超过 128 KiB 时不得读取内容，原因进入 Handoff 待确认。
- 多图任务只读取一个显式目标及其就近规则，最多跟随一个真实引用；没有显式目标时不做全仓兜底。正文读取不超过 4 个，Skill 正文读取为 0。
- 缺失或不可读目标不得触发全仓搜索。

## E. 附件、资源与接口

`$ai-talk 奖励领取后增加 icon/mask 蒙层`

- `icon/mask` 进入项目上下文的资源项，不识别为目录。
- 视觉稿、交互图和截图只显示已提供及附件来源，不复述 OCR。
- 接口资料保留 `state=0` 等真实字段，不猜业务含义。

### 截图研发协议

- 通过 typed evidence 保留 `attachment_N` 和 target/reference/comparison 角色。
- 截图直接可见 UI 与用户明确交互进入 fact；图片关系和项目上下文推导进入带 confidence 的 inference。
- 当前积分、奖励阶段配置、领取状态等只表达数据需求，不生成字段名；未定位项进入 search-resolvable unknown。
- Page Center 资源保留资源名、provider、附件来源和复用事实，未确认 key 不得写成事实。
- verification 从 UI、交互、进度语义和资源复用要求生成验收 assertion，不伪造验证命令。

## F. 建议 Skill

- 输出职责匹配的建议 Skill；未找到目标 Skill 时在待确认中说明安装或启用方式，不改选其他职责。
- 内部 Handoff 字段保持 schema v6 兼容，但不在简短用户输出中展开。
- 明确修改意图使用 `modify_and_verify` 并首轮授权；诊断意图保持 `inspect_only`；分阶段请求使用 `plan_then_execute`。

## G. JSON 与默认交接文本

- JSON 保留 `original_request`、`evidence`、`selection_reason`、`unknowns`、检索、边界和路由字段。
- 默认 `execution_prompt` 必须由 `execution_plan` 单向渲染，不得继续直接消费并重复翻译旧顶层字段。
- 只有 `plan_then_execute` 的一次确认通过 `--previous-contract` 更新状态；明确修改请求不得再次进入授权流程。
- handoff 必须返回 `execution_plan`；`modify_and_verify` 首轮即为 `authorized`，且仍受 `constraints` 约束。
- `retrieval_entries` 必须保留候选的真实 `source`，不得在公开结果映射时丢失。
- 中文输出不暴露评分、候选、canonical ontology、内部 Query 或分析过程。
- Formatter 只允许已补充上下文、AI 判断、公司检索入口、需要确认、下一步五个模块；需要确认无硬阻塞时隐藏。

## H. 字段稳定性

- Stable：`schema_version`、route、task、knowledge requirements、retrieval、scope、facts、constraints、blockers、verification 和 execution prompt renderer。
- Experimental：研发维度只作为现有数组的 typed entries，不增加 `development_context` 等顶层字段。
- Reserved：planned changes、写范围强制、来源优先级引擎和 resolved lifecycle 不得进入生产协议。

## I. 五个边界用例

- 半屏 H5 需要完整链接：定位为已有跳转逻辑调整，检索 `openH5`、URL 构建和同类实现，不要求使用 `new URL()`。
- 奖励领取后增加 `icon/mask`：定位为已有奖励节点领取态视觉修改，检索状态判断、资源引用和同类实现，不猜状态字段。
- 第三个奖励没显示：定位为单节点展示异常，检索节点数据、状态和渲染条件，不推断 `rewardList[2]`。
- 开发一个弹窗：定位为新增 UI，检索现有弹窗组件和同类实现，不补充按钮、props 或事件。
- 明确要求使用 `new URL()`：此时才把 `new URL()` 放入实现边界。

## J. 知识优先五场景

- 新增弹窗并首次进入打开：提取四类所需知识，不展示大量直接依赖，所有入口说明用途。
- 奖励名称和角标缺失：知识覆盖接口字段、数据适配和组件渲染；只推荐有真实内容证据的 `do_lottery`、`openRewardDialog`，不得仅凭文件名推荐奖励弹窗。
- 动态组件未注册：知识覆盖名称生成、注册规则和实际组件名称，不展示 button、iframe 等无关依赖。
- 奖励领取后增加 `icon/mask`：知识覆盖领取状态、资源引用和奖励节点渲染，`icon/mask` 类型为资源。
- 明确文件文案修改：只输出简短任务协议，不生成复杂知识清单。

## K. V1 精确回归补充

- 清晰 Bug 不合成原话、代码或附件未支持的事实。
- `Unknown custom element: <name>` 直接进入动态组件诊断链，保留 kebab-case 组件名，不误判为弹窗开发。
- “帮我改一下这个”只询问一次实施权限；明确的“改成”直接使用 `modify_and_verify`。
- 页面检查只引用“这个 URL”但未提供完整地址时，只询问 URL；存在完整 URL 时直接进入 `ui-self-check`。
