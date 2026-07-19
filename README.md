# AI Talk

AI Talk 是一个显式调用的研发任务整理工具。它先把需求和项目上下文整理成可核对的执行协议，确认后再进入代码实施，适合需求不完整、上下文分散或需要交接的研发任务。

```text
匹配的 Skill
→ 用户原始目标
→ 已确认上下文
→ 执行要求与建议检索
→ 限制与未确认项
```

第一轮只分析，不修改项目，也不会自动调用建议 Skill。检查协议无误后，在下一条消息中输入 `开始执行`。

## 安装

```bash
codex plugin marketplace add /绝对路径/ai-talk-public-marketplace
codex plugin add ai-talk@ai-talk-marketplace
```

## 快速使用

```text
$ai-talk:ai-talk 修复 src/components/reward-card.vue 中第三个奖励没有显示的问题
```

确认输出后，另发一条消息：

```text
开始执行
```

完整的安装步骤、提问模板、示例和常见问题见 [USAGE.md](USAGE.md)。
