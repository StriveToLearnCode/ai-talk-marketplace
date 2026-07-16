# AI Talk 安装与使用说明

显式调用：

```text
$ai-talk <研发任务>
```

AI Talk 保留原始目标，识别研发意图，从目标路径、选中代码、用户文本和真实附件中提取带来源的研发概念，再为公司 Docs、Skill、组件知识库与项目已有实现生成分类查询，每类最多 3 个。默认输出展示研发概念和概括性检索方向，不展示内部 Query 数组，结尾只显示一行真实执行能力。

真实附件可按内容归类为视觉、交互、接口或普通截图；普通文本中的“图片没有显示”不会被当成截图附件。检索词可以加入 `dialog / modal / popup` 等同义表达，但不会扩展为确认按钮、props、样式或其他未确认需求。

AI Talk 不消费下游 Skill 的知识库，也不执行代码任务。公司现有 Skill 使用整理后的上下文与查询完成后续执行。

## 更新

```bash
codex plugin marketplace upgrade personal
codex plugin add ai-talk@personal
```

更新后新建 Codex 对话。
