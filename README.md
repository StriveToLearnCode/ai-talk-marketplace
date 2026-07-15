# AI Talk Marketplace

AI Talk 是一个 Codex 插件，用于基于用户原话、截图和明确目标文件理解研发需求，建立证据与任务指令的对应关系，并生成可复制执行的提示词。它只生成提示词，不执行开发、测试或审查任务。

## 安装

完整安装、调用、更新和常见问题说明见 [USAGE.md](USAGE.md)。

需要支持 `codex plugin` 命令的 Codex CLI。clone 仓库、添加公开 Marketplace 子目录并安装插件：

```bash
git clone https://github.com/StriveToLearnCode/ai-talk-marketplace.git
cd ai-talk-marketplace
codex plugin marketplace add "$PWD/ai-talk-public-marketplace"
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

AI Talk 会区分直接证据、AI 语义判断、建议（非需求）和待确认信息。存在截图、多个附件或多个模块时，它使用“来源或位置 → 直接可见内容 → 对应需求 → 任务指令”建立映射，不输出完整 OCR 清单，也不把未经确认的建议写成硬性要求。

AI Talk 首屏输出“目标”“事实”“自动补充”三组短摘要；事实最多 3 条且只来自直接证据，自动补充最多 3 条并统一使用“执行时……”表述。唯一的自包含 `text` Prompt 放在默认关闭的“查看完整 Prompt”区域内，展开后可直接复制。最后输出：

```text
任务话术已生成，当前尚未执行代码修改。
```

普通任务的完整 Prompt 默认不超过 12 行、约 500 个中文字符；复杂任务最多 18 行、约 800 个中文字符。同一事实只出现一次，不输出固定的执行、交付或通用约束段落。

普通 UI 开发默认不追加浏览器自测。只有用户明确要求 UI 自测、浏览器检查、Playwright 验证或页面截图对比时，AI Talk 才在功能和目标测试后安排 `$ai-talk:ui-self-check`。也可以在开发完成后单独调用：

```text
$ai-talk:ui-self-check 检查 recharge tab2 的移动端布局和交互
$ai-talk:ui-self-check 只检查不修改
```

该 Skill 会实际执行浏览器检查，默认修复本次范围内问题并复验；普通 UI、Figma、截图或 Vue 关键词本身不会触发它。

所有会修改代码的提示词都会要求后续 Codex 闭环 PageCenter 配置。具备 Skill、MCP、项目脚本、账号和权限时必须实际配置并验证；无法代操作或写入失败时，最终报告必须在“外部操作：PageCenter”中标记“需要用户手动操作”，说明原因，并给出可直接照做的 tab、key、填写值或结构示例、目标环境、用途、代码消费位置、操作步骤和未配置影响。配置未完成时不得声称任务全部完成；无需配置时必须明确说明“本次不需要新增或修改 PageCenter 配置”。

## 工作边界

- 最多读取 3 个用户明确附带或指定的本地文件，每个最多 64KB。
- 可以基于明确证据归纳、合并和改写任务目标，但不得凭空补充产品行为、接口字段或验收标准。
- 不跟踪 imports，不读取同目录文件、项目配置、Git 状态或直接依赖。
- 简单任务直接生成提示词；需要项目 Skill 时最多运行一次 `.agents/skills` frontmatter 索引。
- 不读取或执行下游 Skill 正文，不访问 Figma、飞书、浏览器或网络。
- 不修改业务代码，不运行测试、构建、开发服务器、部署或提交。
- 接口任务要求后续 Codex 以 OpenAPI YAML 和生成类型为权威契约，不把已类型化响应字段降级为 `unknown`，不添加无依据的 normalize、业务校验或静默 fallback。

完整行为说明见 [插件文档](plugins/ai-talk/README.md)。

## 更新

```bash
cd /path/to/ai-talk-marketplace
git pull
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
