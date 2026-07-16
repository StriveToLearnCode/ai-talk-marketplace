# AI Talk Marketplace

AI Talk 是“研发任务上下文增强器”：它保留用户原始目标，提取带来源的真实上下文，为公司 Docs、Skill、组件知识库和项目已有实现生成检索查询，补充必要任务边界与一个阻塞未知项，并在结尾标注真实执行 Skill。

## 安装

```bash
git clone https://github.com/StriveToLearnCode/ai-talk-marketplace.git
cd ai-talk-marketplace
codex plugin marketplace add "$PWD/ai-talk-public-marketplace"
codex plugin add ai-talk@ai-talk-marketplace
```

安装后新建对话并显式调用：

```text
$ai-talk:ai-talk 开发 recharge/components/dialogs 下的礼物连爆弹窗
```

默认输出只展示用户目标、已确认上下文、建议检索、任务边界与未知项，结尾显示 `执行能力：<真实 Skill 名称>`。AI Talk 可以扩展检索表达，但不会扩展业务需求，不维护组件索引，也不代替下游 Skill 执行。

普通文本中的“图片、图标、背景图”不会被识别为截图附件。真实附件可分别标记为视觉、交互和接口资料，每项上下文都保留来源。

完整说明见 [USAGE.md](USAGE.md) 和 [插件文档](plugins/ai-talk/README.md)。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s plugins/ai-talk/skills/ai-talk/tests -v
node --test plugins/ai-talk/skills/ai-talk/tests/*.mjs
```

## License

[MIT](LICENSE)
