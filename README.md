# AI Talk

AI Talk 是一个显式调用的研发需求澄清与诊断分诊工具。普通需求只确认会改变实施结果的范围、行为和资源语义；“为什么”“前端还是后端”等请求进入只读故障定位。

```text
用户原话
→ 最多 2 个关键澄清问题
→ 最多 3 条任务专属风险
→ 确认结果
→ AI Talk 退出，代码 Agent 实现
```

澄清模式不读取或修改代码，不设计实现方案，不推荐或调用下游 Skill。需求已经明确时，它会跳过提问并立即退出。

诊断模式是唯一的只读检索例外：它从用户指定的文件和行号出发，依次检查控制层、数据层和渲染层，保存高价值证据并给出可验证定责条件。没有专门诊断 Skill 时保持空路由，不会推荐 `gen-code`。

## 安装

```bash
codex plugin marketplace add /绝对路径/ai-talk-public-marketplace
codex plugin add ai-talk@ai-talk-marketplace
```

## 快速使用

```text
$ai-talk:ai-talk 这两部分的用户头像都需要 pag/user 溜光
```

AI Talk 只会确认“这两部分”的范围和 PAG 实例语义，并提醒 `ui-pag` 实例上限、PAG name 唯一性和点击层级风险。确认后由代码 Agent 独立实现。

完整说明见 [USAGE.md](USAGE.md)。旧的项目检索与 TaskHandoff 路由器保留为 CLI 兼容层，不参与正常 `$ai-talk` 对话。
