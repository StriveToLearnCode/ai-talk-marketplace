# AI Talk Marketplace

AI Talk 是一个 Codex 插件，用于把自然语言研发需求整理成可复制执行的提示词。它只生成提示词，不执行生成出来的开发、测试或审查任务。

## 安装

需要支持 `codex plugin` 命令的 Codex CLI。添加 Marketplace 并安装插件：

```bash
codex plugin marketplace add StriveToLearnCode/ai-talk-marketplace --ref master
codex plugin add ai-talk@ai-talk-marketplace
```

安装完成后新建 Codex 对话，使新线程加载 AI Talk Skill。

## 使用

显式调用插件 Skill：

```text
$ai-talk:ai-talk <需要整理的研发任务>
```

示例：

```text
$ai-talk:ai-talk 修改 src/page.vue 中的错误语法，保留业务逻辑
$ai-talk:ai-talk 这部分需要奖励预览，完成后补目标范围测试
$ai-talk:ai-talk 审查 src/utils/reward.ts，只生成 review 提示词
```

AI Talk 输出任务摘要、一个可复制的 `text` 提示词代码块，以及：

```text
任务话术已生成，当前尚未执行代码修改。
```

## 工作边界

- 最多读取 3 个用户明确附带或指定的本地文件，每个最多 64KB。
- 不跟踪 imports，不读取同目录文件、项目配置、Git 状态或直接依赖。
- 简单任务直接生成提示词；需要项目 Skill 时最多运行一次 `.agents/skills` frontmatter 索引。
- 不读取或执行下游 Skill 正文，不访问 Figma、飞书、浏览器或网络。
- 不修改业务代码，不运行测试、构建、开发服务器、部署或提交。

完整行为说明见 [插件文档](plugins/ai-talk/README.md)。

## 更新

```bash
codex plugin marketplace upgrade ai-talk-marketplace
codex plugin add ai-talk@ai-talk-marketplace
```

更新后新建 Codex 对话。

## 卸载

```bash
codex plugin remove ai-talk@ai-talk-marketplace
codex plugin marketplace remove ai-talk-marketplace
```

## 本地开发

在仓库根目录执行：

```bash
codex plugin marketplace add "$PWD"
codex plugin add ai-talk@ai-talk-marketplace
```

不改动现有 Codex 配置的隔离安装验证：

```bash
mkdir -p /private/tmp/ai-talk-codex-home
CODEX_HOME=/private/tmp/ai-talk-codex-home codex plugin marketplace add "$PWD" --json
CODEX_HOME=/private/tmp/ai-talk-codex-home codex plugin add ai-talk@ai-talk-marketplace --json
CODEX_HOME=/private/tmp/ai-talk-codex-home codex plugin list --json
```

运行测试：

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s plugins/ai-talk/skills/ai-talk/tests -v

node --test \
  plugins/ai-talk/skills/ai-talk/tests/test_build_capability_index.mjs
```

检查 JSON：

```bash
python3 -m json.tool .agents/plugins/marketplace.json >/dev/null
python3 -m json.tool plugins/ai-talk/.codex-plugin/plugin.json >/dev/null
```

人工验收用例见 [acceptance-cases.md](plugins/ai-talk/tests/acceptance-cases.md)。

## 常见问题

### 安装后无法调用

确认 `codex plugin list` 中存在并启用了 `ai-talk@ai-talk-marketplace`，然后新建 Codex 对话。插件更新不会改变已经开始的线程。

### Marketplace 名称已存在

先用 `codex plugin marketplace list` 检查已配置来源。只有确定旧来源不再需要时，才执行：

```bash
codex plugin marketplace remove ai-talk-marketplace
```

然后重新运行安装命令。

### AI Talk 为什么没有修改代码

这是预期行为。AI Talk 是提示词整理器，输出内容需要交给后续 Codex 执行。

### 会访问链接或扫描项目吗

不会。Figma、飞书等链接只会写入提示词交给后续 Codex；本地文件也只在用户明确指定时进行有界读取。

## License

[MIT](LICENSE)
