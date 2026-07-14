# AI Talk Plugin

AI Talk 只把自然语言研发需求整理成可复制执行的提示词，不执行最终开发任务。

## 工作流

```text
理解用户输入
→ 有界读取最多 3 个明确目标文件
→ 简单任务零命令生成
→ 需要项目 Skill 时只扫描 .agents/skills frontmatter
→ 将 Skill 名称、路径、模式和执行顺序写入 text 代码块
→ 立即停止
```

## 运行边界

- 本地附件或精确路径最多读取 3 个，每个最多一次、最多 64KB。
- 不读取 imports、同目录文件、`AGENTS.md`、项目配置、Git 状态或其他依赖。
- 项目命令最多 1 次，只允许 `build-capability-index.mjs --skills-only`。
- 不读取候选 Skill 正文、reference、脚本或资源。
- 不调用 Skill、Agent、MCP、Figma、飞书、Chrome、浏览器或网络工具。
- Figma、飞书等 URL 不打开；明确附带的本地 `openapi.yaml` 可以读取。
- 不运行 `collect_context.py`、完整项目索引、formatter、lint、测试或构建。
- `$gen-code`、`$ai-test` 等只作为 fenced `text` 代码块中的待执行提示词。

## Skill 路由

```bash
node skills/ai-talk/scripts/build-capability-index.mjs \
  --root /path/to/project \
  --skills-only \
  --intent modify_and_verify \
  --skill-limit 10 \
  --query '这部分需要奖励预览并补测试'
```

索引仅解析 `.agents/skills/**/SKILL.md` frontmatter 的 `name` 和 `description`。功能与测试同时存在时，最终提示词先安排代码 Skill 的 `local-patch + incremental`，再安排测试 Skill 处理目标范围测试；AI Talk 当前轮不会执行两者。

对会修改代码的任务，最终提示词还要求后续 Codex 完成代码和验证后检查 PageCenter 依赖。需要配置时，按 `text`、`json`、`assets`、`components`、`props` tab 给出 key、填写值或结构示例、用途、代码消费位置、属于新增/修改/已存在但未验证的状态和具体操作步骤，不能让用户自行搜索；若生成了 `page-center-config.request.json`，同时报告路径。无需配置时明确说明“本次不需要新增或修改 PageCenter 配置”。AI Talk 本轮不会检查具体依赖、生成配置项或推送 PageCenter。

## 输出

AI Talk 输出一屏摘要、一个完整 `text` 提示词代码块，以及：

```text
任务话术已生成，当前尚未执行代码修改。
```

输出后不得继续读取或调用工具。简单任务和 Skill 路由任务总耗时目标均为 15 秒内。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/ai-talk/tests -v
node --test skills/ai-talk/tests/test_build_capability_index.mjs
```

人工新线程验收见 `tests/acceptance-cases.md`。
