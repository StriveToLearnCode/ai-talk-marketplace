# AI Talk Marketplace

AI Talk 是 `Intent Normalizer + Skill Query Router`：原样保留用户目标，把口语、截图角色和任务动词归一化为八字段检索画像，再匹配真实运行时公司 Skill。

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

AI Talk 输出原始目标、检索画像摘要、Top 1、最多 2 个备选、真实路径、推荐依据、相近 Skill 排除原因，以及至多一个真正阻塞项。

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
