# AI Talk Marketplace

AI Talk 是 `Intent Normalizer + Skill Query Router`：内部保留结构化检索画像用于匹配，再用简短自然语言向开发者说明任务理解和推荐结果。

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

AI Talk 默认输出约 150 字，只包含 AI 理解、推荐执行、最多 3 条判断依据和 1 个必要的未选择原因。正常回复只显示 Skill 名称，不显示画像字段、绝对路径、索引冲突或重复 name。

同义扩展词只提高召回，不会成为用户已确认需求。AI Talk 不维护组件知识库或映射，不指定具体组件，不读取下游 references，不生成执行 Prompt、代码或配置，也不调用下游 Skill。

完整说明见 [USAGE.md](USAGE.md) 和 [插件文档](plugins/ai-talk/README.md)。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s plugins/ai-talk/skills/ai-talk/tests -v
node --test plugins/ai-talk/skills/ai-talk/tests/*.mjs
```

基准测试会输出 Top 1 命中率、Top 3 召回率、混淆矩阵和错误案例。

## License

[MIT](LICENSE)
