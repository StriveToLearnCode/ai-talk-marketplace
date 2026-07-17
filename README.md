# AI Talk

AI Talk 是显式调用的研发执行协议生成器。它不只改写需求，而是按价值顺序输出：

```text
用户原意
→ 有证据时的任务专属 AI 推断
→ 显式目标内的项目上下文
→ 最多 2 条实现约束
→ 可选的建议 Skill
```

AI 推断只判断当前任务更可能属于哪类工程修改，以及应优先确认哪些具体对象；证据不足时整个模块省略。通用规则只进入实现约束。项目上下文只读取显式目标、沿路径生效的 `AGENTS.md` 和目标文件的一层本地依赖，不执行全仓搜索。

解析轮只允许受限只读，不修改项目、不调用下游 Skill。建议 Skill 仅在高置信时出现，并且仍需用户在后续一轮明确授权执行。

## 安装

```bash
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
