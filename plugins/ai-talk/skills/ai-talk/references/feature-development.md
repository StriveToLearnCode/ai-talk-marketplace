# 新需求提示词骨架

本文件仅保存提示词模板。AI Talk 不读取业务项目或执行模板中的 Skill。

```text
用户明确需求：
【保留用户原话，不扩写目标或功能】

已读取上下文：
【仅写最多 3 个明确目标文件中实际可见且直接相关的结构；保留路径】

已选择能力：
【写入 $<skill-name>、真实 frontmatter 路径、用途和后续执行顺序；明确尚未调用】

未确认信息：
【只写会改变任务方向的阻塞项；没有则省略】

执行边界：
请由后续 Codex 按顺序调用提示词中指定的 Skill。局部代码修改使用 local-patch + incremental；读取组件注册表和真实组件文档后优先复用已有能力；直接修改并验证，不先输出方案，不修改无关代码。

PageCenter 配置交接：
完成代码和验证后，检查本轮新增或修改的代码是否依赖 PageCenter 配置。需要时，不得让用户自行搜索配置项；按 text/json/assets/components/props tab 列出每个新增或修改的 key、填写值或结构示例、用途、代码消费位置、属于新增/修改/已存在但未验证的状态和具体操作步骤。无法确认的值标记为 TODO 并说明获取来源，不得编造。若生成了 page-center-config.request.json，同时报告文件路径，但不能只给文件路径。不需要时，明确说明“本次不需要新增或修改 PageCenter 配置”。
```

功能和测试同时存在时，先写代码 Skill，再写测试 Skill。AI Talk 当前轮只可有界读取明确目标文件，不得读取候选 Skill 正文、依赖文件或外部资料，也不得执行任何步骤。AI Talk 只写入 PageCenter 交接要求，不检查依赖、不生成具体配置项，也不调用 `gen-page-center-config` 或 PageCenter MCP。
