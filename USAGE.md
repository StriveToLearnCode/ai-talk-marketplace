# AI Talk 安装与使用说明

主 Skill `$ai-talk` 负责理解任务、决定真实公司 Skill，并以 Execution Brief 解释决策；它不执行开发任务。独立 `$ai-talk:ui-self-check` 保留，但主 Skill 不会自动编排它。

## 使用

```text
$ai-talk <研发任务>
```

内部画像固定包含：`task_action`、`target_category`、`desired_output`、`execution_mode`、`evidence_types`、`intent_terms`、`exclusion_terms`、`unknowns`，仅用于匹配和调试。

同义扩展词只用于检索召回，不会成为用户已确认需求。AI Talk 只读取真实运行时 Skill 的 frontmatter、description 与明确触发条件/适用场景短段；`docs/skills` 对照副本不会参与运行。

默认入口经独立 formatter 展示“AI 理解 / 为什么这样决定 / AI 将利用 / AI 已决定”四段。决策依据最多 4 条且必须来自当前任务；上下文按截图、设计稿、接口、项目代码、`AGENTS.md` 和明确复用的已有组件动态出现。Skill 同时显示职责。相近 Skill 确实容易引起疑问时，用“为什么不用…？”自然说明，不输出“未选择”字段。路径、评分、候选、重复 `name` 和索引冲突仅在显式 `--debug-json` 调试输出中存在。

“打开页面 / 看看页面 / 浏览器检查”和“视觉 / 交互 / 响应式 / 控制台 / 网络”同时出现时，优先决定使用 `ui-self-check`；“有问题、异常、不对”等泛化词不能覆盖即时检查意图。已有页面出现明确实现异常时仍决定进入定位并修复流程。

只有真实图片附件、显式 `evidence_type=screenshot` 或“见截图、参考截图、截图如下、根据这张图”等明确表述会被识别为截图证据。旧 `--profile-json` 路由入口已禁用。

AI Talk 不读取候选 Skill 知识库，不生成详细实施方案、代码、配置或测试，不调用候选 Skill，也不提供自定义 UI。默认回复不展示执行步骤、“读取规范”“格式化代码”“验证代码”等默认工程动作；本轮不会读取的上下文不会出现。

## 更新

```bash
codex plugin marketplace upgrade personal
codex plugin add ai-talk@personal
```

更新后新建 Codex 对话。
