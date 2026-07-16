# AI Talk

<<<<<<< HEAD
AI Talk 是显式调用的研发 Task Contract 生成器。它保留用户原始目标和真实证据，识别会影响业务结果、修改范围或实现方向的 Context Gap，再把合同交给后续 Codex 自行检索和执行。

```text
用户原始目标与真实证据
→ confirmed_context（每项带 source）
→ 五类 intent + 研发概念
→ 关系与冲突
→ 结构化 unknowns（阻塞 / 非阻塞）
→ 任务边界与验收标准
→ Task Contract
```

AI Talk 不搜索项目、不读取公司 Docs、不调用 Skill、不规划检索顺序，也不扩展用户未确认的功能、交互或数据结构。
=======
AI Talk 是显式调用的 AI Execution Protocol Builder。它把自然语言、截图、文件和代码上下文整理为交给 Company Skill 的执行协议。

```text
Goal
Context
Need Knowledge
Assumptions（按需）
Constraints
Next Skill（仅高置信）
```

协议回答六件事：最终完成什么、已经确认什么、执行前还必须知道什么、实现方向依赖哪些真实假设、不能越过哪些边界、哪个 Skill 最适合继续。

内部 `intent`、`entities`、分类 Query 和 Skill 路由继续负责检索与判断，但不会出现在协议中。AI Talk 不输出 Object、Relation、ontology、OCR 总结、分析过程、评分或验收报告，也不代替下游 Skill 执行。
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)

## 安装

```bash
<<<<<<< HEAD
codex plugin marketplace add StriveToLearnCode/ai-talk-marketplace --ref master
codex plugin add ai-talk@personal
```

安装或更新后新建对话，再显式调用：

```text
$ai-talk 奖励获取后增加蒙层，资源 icon/mask
```

公开 marketplace 使用 `$ai-talk:ai-talk`。

## 文件职责

- `plugins/ai-talk/skills/ai-talk/SKILL.md`：Context Gap 与 Task Contract 契约。
- `plugins/ai-talk/skills/ai-talk/scripts/route-company-skills.mjs`：历史兼容入口；只生成 Task Contract，不执行路由。
- `plugins/ai-talk/skills/ai-talk/scripts/format-user-output.mjs`：确定性的默认输出。
- `ai-talk-public-marketplace/`：公开发布副本。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s plugins/ai-talk/skills/ai-talk/tests -v
node --test plugins/ai-talk/skills/ai-talk/tests/*.mjs
```
=======
codex plugin marketplace add /absolute/path/to/ai-talk-marketplace
codex plugin add ai-talk@ai-talk-marketplace
```

## 使用

```text
$ai-talk 在 banner-spin.vue 中，积分阶段 PROGRESS_TASK_ID: 7，然后一样展示进度和奖励
$ai-talk 为什么第三个奖励没显示
$ai-talk state=0 页面却已领取
$ai-talk 奖励领取后增加 icon/mask 蒙层
$ai-talk 开发一个弹窗
```

详见 [USAGE.md](USAGE.md)。
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
