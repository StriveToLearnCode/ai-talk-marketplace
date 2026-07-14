# AI Talk 纯提示词模式验收

每个用例在刷新 cachebuster、重新安装插件后的全新 Codex 对话中运行。记录耗时、命令、文件读取、Skill 调用和最终输出。

## 1. 明确机械修改

```text
$ai-talk:ai-talk 修改 apps/page.vue，把错误的 Pug 风格组件调用改成合法 Vue HTML 标签，保留业务逻辑。
```

通过条件：读取明确指定的 `apps/page.vue` 一次且不超过 64KB；不读取依赖或同目录文件；零 Skill 调用；15 秒内输出结合文件现状的提示词并停止。

## 2. 新增局部功能

```text
$ai-talk:ai-talk 这部分需要奖励预览。目标文件是 pages-O/recharge/mods/tab2/mod1.vue，点击不同奖励时预览当前奖励，不修改无关代码。
```

通过条件：读取目标文件一次且不超过 64KB，只运行一次 Skill-only 索引；`gen-code` 为首位候选；不读取 imports、同目录文件或 `gen-code/SKILL.md` 正文；摘要包含“已读取上下文”；最终 `text` 代码块包含文件现状、`$gen-code`、真实路径、`local-patch + incremental`、目标范围和验证要求；当前轮不调用 `$gen-code`。

## 3. 功能与测试组合

```text
$ai-talk:ai-talk 结合联调文档、Figma 和现有 mod2.vue 完成 recharge Tab2 的功能与测试。联调文档和 Figma 链接已提供，只处理 mod2 及必要测试接线。
```

通过条件：

- 只运行一次 `.agents/skills` frontmatter 索引，总耗时 15 秒内。
- 有界读取用户明确提供的本地 `mod2.vue` 和本地联调文档，每个最多一次、最多 64KB；不打开 Figma URL，不读取项目规则、imports、候选 Skill 正文或 reference。
- 不调用 Chrome、浏览器、飞书、Figma、Agent、MCP 或任何下游 Skill。
- 最终 `text` 代码块先安排 `$gen-code` 使用 `local-patch + incremental` 完成功能，再安排 `$ai-test` 处理目标范围测试。
- `$gen-code` 和 `$ai-test` 只出现在待复制提示词中；输出后立即停止。

## 4. 显式 Skill 名称不触发执行

```text
$ai-talk:ai-talk 使用 $ai-test 帮我整理 recharge 页面测试任务，只输出优化后的提示词。
```

通过条件：不得把 `$ai-test` 视为当前轮执行授权；不得读取 `ai-test/SKILL.md`、检查 `figma-context.json`、调用 `gen-ai-test-context` 或运行测试；只把 `$ai-test` 写入最终 `text` 代码块。

## 5. 读取数量上限

同时附带 `one.vue`、`two.ts`、`three.yaml` 和 `four.md`。

通过条件：按输入顺序只读取前三个文件，每个最多一次、最多 64KB；不读取 `four.md`，在最终提示词中要求后续 Codex 读取它。

## 6. 不跟踪依赖

附带的 `mod3.vue` 中包含 imports、组件引用和配置引用。

通过条件：只读取 `mod3.vue`，不读取任何 import、同目录组件、`AGENTS.md`、`package.json`、项目配置或 Git 状态；不得使用 `rg`、`find`、Glob 或目录列表。

## 7. 外部资料只作为后续输入

```text
$ai-talk:ai-talk 根据这个飞书联调文档和 Figma 链接整理实现提示词。
```

通过条件：不打开链接、不读取 Chrome skill、不访问网络；若同时提供本地 `openapi.yaml`，只读取该本地文件；提示词要求后续 Codex 在执行阶段访问链接。

## 8. Bug 分析

```text
$ai-talk:ai-talk 轮播图偶尔不切换，只整理定位提示词，不修改代码。
```

通过条件：走 `direct + analyze`；零命令、零文件读取；不调用调试 Skill；不把猜测写成根因。

## 9. 简单 review

```text
$ai-talk:ai-talk 审查 src/utils/reward.ts 最近的改动，重点看行为回归和缺失测试，只生成 review 提示词。
```

通过条件：走 `direct + review`；有界读取明确目标文件，但不读取依赖或执行审查；最终提示词保留文件现状、范围、关注点和只审查边界。

## 10. Skill-only 无结果

让 `.agents/skills` 不存在或没有匹配 frontmatter。

通过条件：说明没有发现适用项目 Skill，但仍输出最小提示词；不运行 `collect_context.py`、完整索引、项目搜索或浏览器，不读取任何未明确提供的业务文件。

## 11. 输出契约

任意 ready 任务都必须输出一屏摘要、一个 fenced `text` 代码块和：

```text
任务话术已生成，当前尚未执行代码修改。
```

代码块后不得继续读取、调用或执行，不得显示确认、取消或开始按钮。

## 12. 七行进度条目标文件

附带一个 7 行的 `mod3.vue`，内容只有现有容器、注释或空模板，并输入：

```text
$ai-talk:ai-talk 写进度条模板
```

通过条件：只读取 `mod3.vue` 一次；摘要“已读取上下文”准确描述当前容器、空模板或标签风格；最终提示词明确进度条模板的插入范围并保留现有结构；不读取任何依赖，不调用 Skill，不修改文件。
