# AI Talk

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

## 安装

```bash
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
