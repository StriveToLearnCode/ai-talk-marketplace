# AI Talk Plugin

AI Talk 将自然语言研发需求整理成可直接交给 Codex 的任务话术。它优先实际调用当前会话中适用的项目或公司 Skill 执行只读能力发现，再使用项目本地索引补充规则、组件、utility、Prompt 和历史实现。

AI Talk 不执行最终开发任务，不修改业务代码，也不提供任务确认卡或伪按钮。

## 工作流

```text
理解需求
→ 从当前 Available Skills 选择专用 Skill
→ 完整读取并执行其只读发现流程
→ 组件需求先检索公司封装组件
→ 确定则采用，存疑则展示最多 3 个候选
→ 无公司组件时由用户选择检查项目或新建本地组件
→ 生成任务话术
```

专用组件目录、物料平台、活动开发或接口契约 Skill 优先于通用前端、教学和调试 Skill。Skill 仅被索引到不代表已经使用；只有实际读取并执行后才会出现在“实际调用 Skill”中。

## 本地上下文

```bash
python3 skills/ai-talk/scripts/collect_context.py \
  --root /path/to/project \
  --query '开发带确认和加载状态的操作入口' \
  --defer-project-component-choice \
  --related apps/short/current-activity
```

输出 `task_context`，包含：

- `task.scenes`：任务场景，可同时命中多个。
- `task.handling_mode`：`analyze / plan / modify_and_verify / review`。
- `task.prompt_state`：`draft / ready`。
- `capabilities.skill_candidates`：项目或显式目录发现的 Skill 提示，尚未调用。
- `capabilities.automatic`：明确的项目规则和本地复用候选。
- `capabilities.choice_required`：需要用户选择的真实复用歧义。
- `capabilities.project_component_selection_deferred`：公司组件阶段是否暂缓展示和选择项目组件。

索引只扫描项目根目录和显式 `--source-root`，不会扫描用户 Skill 目录或插件缓存。当前会话的 Available Skills 是 Skill 发现的权威来源。

## 公司组件检索

- 不预设 Skill 或组件名称，只根据用户需求、真实项目技术栈和使用场景检索。
- 唯一明显最佳且证据充分的结果直接采用，但仍要求后续验证兼容性。
- 结果不确定时最多展示 3 个候选，每项只显示组件名称和匹配原因。
- 没有合适公司组件时明确提示，并让用户选择“检查当前项目已有实现”或“新建本地组件”。
- 公司候选与项目候选严格分阶段处理；未选择项目检查前不得自动展示本地组件。

## 输出

AI Talk 输出一屏任务摘要、一个完整任务话术代码块，以及：

```text
任务话术已生成，当前尚未执行代码修改。
```

不存在确认、取消、开始执行或插入输入框动作。用户要求调整时，AI Talk 根据完整对话重新生成话术。

## 安全边界

- AI Talk 每轮只运行一次 `collect_context.py`；用户选择项目检查后可在下一轮取消组件选择延迟。
- 被调用 Skill 只执行与当前任务有关的只读检索步骤。
- 不运行 formatter、lint、测试、构建、开发服务器、部署或提交。
- 不读取 `.env`、密钥、依赖目录和构建产物。
- 不把候选发现写成兼容性结论；后续 Codex 必须检查真实 props、事件、依赖、数据结构和样式覆盖能力。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/ai-talk/tests -v
node --test skills/ai-talk/tests/test_build_capability_index.mjs
```

人工新线程验收见 `tests/acceptance-cases.md`。
