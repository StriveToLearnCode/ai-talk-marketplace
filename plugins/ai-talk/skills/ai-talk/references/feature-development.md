# 新需求提示词骨架

本文件仅保存提示词模板。AI Talk 不读取业务项目或执行模板中的 Skill。

默认将完整 Prompt 控制在 12 行、约 500 个中文字符内；复杂任务最多 18 行、约 800 个中文字符。同一事实只出现一次，不输出固定的执行、交付或通用约束段落。完整 Prompt 放在默认关闭的 `<details>` 内，首屏只显示目标、事实和执行时自动补充。

接口任务将以下内容压成一行：以项目 OpenAPI YAML、真实请求封装和生成类型为权威契约；API 类型直接复用生成类型，一次性响应优先依赖推断；不得把已类型化字段降级为 `unknown`，不得增加无依据的转换、normalize helper、业务校验或静默 fallback；真实响应违约时报告不一致，不在消费层偷偷修正。没有生成类型且上游确为 any/unknown 时才补最小局部类型。

PageCenter 在 Prompt 中只保留一行，但后续交付仍必须报告“外部操作：PageCenter”的“已完成”“需要用户手动操作”或“无需配置”状态。能操作则实际配置并报告 text/json/assets/components/props 的 tab/key/value、目标环境、代码消费位置和验证结果；不能则给出原因、完整步骤和未配置影响；未知值写 TODO+来源，不得猜测或声称任务全部完成；若有 page-center-config.request.json 则附路径。

```text
请直接完成 modify_and_verify。
目标：{{一句话目标}}
范围：{{目标文件/模块}}；不修改 {{明确边界}}
依据：
- [事实/推导/待确认] {{来源}} → {{只写会改变实现的指令，最多 4 条}}
建议（非需求，不作为必须实现项）：{{仅有价值时保留一条}}
任务边界：{{仅当前任务特有边界；接口任务才追加紧凑的 OpenAPI 契约要求}}
执行补充：读取适用 AGENTS.md 和项目规范；使用 $<skill-name>（{{真实 frontmatter 路径}}）按 local-patch + incremental 修改，按需读取组件注册表和真实组件文档并完成目标范围验证。
{{仅用户明确要求测试时：随后使用测试 Skill 处理目标范围测试}}
{{仅用户明确要求 UI 自测时：最后使用 $ai-talk:ui-self-check 检查并复验}}
PageCenter：代码验证后检查依赖并报告“外部操作：PageCenter”状态；能操作则配置验证，不能则给完整步骤和影响，无依赖则标记“无需配置”。
```

功能和测试同时存在时，先写代码 Skill，再写测试 Skill；只有用户明确要求 UI 自测时才追加 `$ai-talk:ui-self-check`，最后写入 PageCenter 配置闭环。AI Talk 当前轮只可有界读取明确目标文件，不得读取候选或 companion Skill 正文、依赖文件或外部资料，也不得执行任何步骤。AI Talk 只写入可选 Skill 名称和 PageCenter 闭环要求，不调用浏览器，不检查依赖、不生成具体配置项，也不调用 `gen-page-center-config` 或 PageCenter MCP。
