# AI Talk Plugin

AI Talk 只把自然语言研发需求整理成可复制执行的提示词，不执行最终开发任务。

## 工作流

```text
理解用户输入
→ 简单任务零命令生成
→ 需要项目 Skill 时只扫描 .agents/skills frontmatter
→ 将 Skill 名称、路径、模式和执行顺序写入 text 代码块
→ 立即停止
```

## 运行边界

- 项目命令最多 1 次，只允许 `build-capability-index.mjs --skills-only`。
- 不读取目标文件、业务目录、项目规则或接口文档。
- 不读取候选 Skill 正文、reference、脚本或资源。
- 不调用 Skill、Agent、MCP、Figma、飞书、Chrome、浏览器或网络工具。
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
