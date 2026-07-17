# AI Talk

AI Talk 是显式调用的研发执行协议生成器。它不只改写需求，而是按价值顺序输出：

```text
用户目标
→ 有证据时的任务定位
→ 显式目标内的项目上下文
→ 最多 5 条建议检索
→ 最多 2 条实现边界
→ 可选的建议 Skill
```

任务定位只判断任务属于新增、修改、排查还是验证，识别用户关注的实现对象，并说明检索重点，不给出代码方案。真实代码事实只进入项目上下文；建议检索输出可直接用于公司 Skill、Docs、组件知识库或仓库代码搜索的短语。

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
