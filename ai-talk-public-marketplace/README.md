# AI Talk Marketplace

AI Talk 是 `AI Decision Layer`：内部保留结构化检索画像用于匹配，再以 Execution Brief 向开发者说明 AI 理解了什么、为什么这样决定、会利用哪些真实上下文，以及已决定 Skill 的职责。

## 安装

```bash
git clone https://github.com/StriveToLearnCode/ai-talk-marketplace.git
cd ai-talk-marketplace
codex plugin marketplace add "$PWD/ai-talk-public-marketplace"
codex plugin add ai-talk@ai-talk-marketplace
```

安装后新建对话并显式调用：

```text
$ai-talk:ai-talk 新增奖励确认弹窗，不改领取逻辑
```

AI Talk 默认入口经独立 formatter 输出 Execution Brief：任务理解、最多 4 条具体决策依据、动态真实上下文、Skill 名称与职责。正常回复不显示画像字段、绝对路径、评分、候选、索引详情或执行步骤。

同义扩展词只提高召回，不会成为用户已确认需求。图片、图标或背景图等对象词不会被当作用户提供了截图。AI Talk 不维护组件知识库或映射，不指定具体组件，不读取下游 references，不生成执行 Prompt、代码或配置，也不调用下游 Skill。

完整说明见 [USAGE.md](USAGE.md) 和 [插件文档](plugins/ai-talk/README.md)。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s plugins/ai-talk/skills/ai-talk/tests -v
node --test plugins/ai-talk/skills/ai-talk/tests/*.mjs
```

基准测试会输出 Top 1 命中率、Top 3 召回率、混淆矩阵和错误案例。

## License

[MIT](LICENSE)
