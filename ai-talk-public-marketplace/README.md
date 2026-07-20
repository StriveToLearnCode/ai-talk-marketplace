# AI Talk

AI Talk 是一个显式调用的研发上下文增强工具。它保留用户原话，补充高价值事实、任务专属工程判断和真实公司检索入口，并从原话直接确定执行模式。

```text
用户输入
→ 已补充上下文
→ AI 工程判断
→ 有证据的知识与检索入口映射
→ 阶段与 Skill
```

明确使用“开发、实现、修改、修复”等动作词时，AI Talk 直接进入 `modify_and_verify`，不再要求二次授权。诊断表达保持只读；只有“先给方案，确认后再改”才在方案完成后确认一次。

## 安装

```bash
codex plugin marketplace add /绝对路径/ai-talk-public-marketplace
codex plugin add ai-talk@ai-talk-marketplace
```

## 快速使用

```text
$ai-talk:ai-talk 修复 src/components/reward-card.vue 中第三个奖励没有显示的问题
```

输出会直接显示 `当前阶段：修改代码` 和唯一的下游 Skill 入口；宿主支持 Skill handoff 时会在同一轮继续执行。

完整的安装步骤、提问模板、示例和常见问题见 [USAGE.md](USAGE.md)。
