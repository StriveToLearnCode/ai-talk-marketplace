# AI Talk 安装与使用说明

显式调用：

```text
$ai-talk:ai-talk <研发任务>
```

AI Talk 保留原始目标，提取带来源的目标路径、选中代码和附件角色，生成 3～6 个面向公司 Docs、Skill、组件知识库与项目已有实现的检索方向，并补充真实适用的边界和最多一个阻塞未知项。默认输出结尾只显示一行真实执行能力。

真实附件可按内容归类为视觉、交互、接口或普通截图；普通文本中的“图片没有显示”不会被当成截图附件。检索词可以加入 `dialog / modal / popup` 等同义表达，但不会扩展为确认按钮、props、样式或其他未确认需求。

AI Talk 不消费下游 Skill 的知识库，也不执行代码任务。公司现有 Skill 使用整理后的上下文与查询完成后续执行。

## 更新

```bash
codex plugin marketplace upgrade personal
codex plugin add ai-talk@personal
```

更新后新建 Codex 对话。
