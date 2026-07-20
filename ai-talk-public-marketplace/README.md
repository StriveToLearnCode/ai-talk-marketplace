# AI Talk

AI Talk 是一个显式调用的研发上下文增强工具。它保留用户原话，补充高价值事实、任务专属工程判断和真实公司检索入口，确认后再进入代码实施。

```text
用户输入
→ 已补充上下文
→ AI 工程判断
→ 有证据的知识与检索入口映射
→ 阶段与 Skill
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
