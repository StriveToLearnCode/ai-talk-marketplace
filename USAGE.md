# AI Talk 安装与使用说明

AI Talk 是一个 Codex 插件，用于理解和整理研发需求。它会把用户原话、截图和明确指定的文件整理成一段可复制的执行提示词，但不会在当前轮直接修改代码。

插件包含两个需要显式调用的 Skill：

| Skill | 用途 | 是否自动执行 |
| --- | --- | --- |
| `$ai-talk` | 理解需求、建立证据对应关系并生成可复制提示词 | 否，必须显式调用 |
| `$ai-talk:ui-self-check` | 使用浏览器检查页面视觉、交互、响应式、控制台和网络 | 否，必须显式调用或明确要求 UI 自测 |

## 一、安装前提

需要安装支持插件命令的 Codex，并能正常执行：

```bash
codex plugin --help
```

如果该命令不存在，请先更新 Codex，再继续安装。

## 二、安装插件

直接从 GitHub 添加 marketplace，不需要手动 clone 仓库：

```bash
codex plugin marketplace add StriveToLearnCode/ai-talk-marketplace --ref master
codex plugin add ai-talk@personal
```

确认安装结果：

```bash
codex plugin list --json
```

输出中应存在已启用的 `ai-talk@personal`。安装后请新建一个 Codex 对话，已经打开的旧对话不会自动加载新 Skill。

## 三、整理研发需求

在新对话中显式调用主 Skill：

```text
$ai-talk <需要整理的研发任务>
```

常用示例：

```text
$ai-talk 修改 src/page.vue 中的错误语法，保留现有业务逻辑

$ai-talk 结合我附带的页面截图，把图片区域与需求逐项对应，并生成后续 Codex 可直接执行的提示词

$ai-talk 读取本地 openapi.yaml，整理接口联调任务；不要打开外部链接

$ai-talk 审查 src/utils/reward.ts，只生成 review 提示词，不执行审查
```

AI Talk 会输出：

1. 一屏内的“需求理解与对应”摘要。
2. 一个完整的 fenced `text` 代码块。
3. 固定的未执行声明。

复制完整 `text` 代码块，交给后续 Codex 执行即可。摘要用于查看 AI 的判断依据，不是执行提示词的必要依赖。

接口任务默认以项目 OpenAPI YAML 和生成类型为权威契约。已经声明为 `number` / `integer` 的服务端响应字段会直接按 `number` 使用，不应再降级为 `unknown` 或额外增加 `Number()`、正数判断、normalize helper 和静默 fallback。

## 四、执行 UI 自测

普通 UI、Vue、Figma 或截图任务不会自动启动浏览器检查。需要 UI 自测时，必须明确要求，或者单独调用：

```text
$ai-talk:ui-self-check 检查 recharge tab2 的移动端布局和交互
```

默认模式会检查本次任务范围内的问题，发现问题后修复并复验。只需要检查和报告、不允许修改时使用：

```text
$ai-talk:ui-self-check 检查 recharge tab2，只检查不修改
```

可以在指令中补充 URL、视口、页面状态和参考截图：

```text
$ai-talk:ui-self-check 检查 http://127.0.0.1:3000/recharge 的 tab2，使用 375x812 视口，对比附带截图，只检查不修改
```

UI 自测会报告实际 URL、视口、页面状态、操作步骤、视觉与交互结果、控制台错误、失败请求以及修复后的复验结果。浏览器、服务或登录态不可用时，它会报告具体阻塞，不会伪造通过结论。

## 五、推荐使用流程

```text
1. 使用 $ai-talk 整理需求。
2. 检查“需求理解与对应”摘要是否符合原意。
3. 复制输出的完整 text 代码块，交给后续 Codex 执行。
4. 只有确实需要浏览器验证时，再调用 $ai-talk:ui-self-check。
```

这样普通开发任务不会承担浏览器启动和页面遍历的时间成本。

## 六、更新插件

刷新 Git marketplace 并重新安装：

```bash
codex plugin marketplace upgrade personal
codex plugin add ai-talk@personal
```

更新完成后新建 Codex 对话，让新线程加载最新版本。

## 七、卸载插件

```bash
codex plugin remove ai-talk@personal
```

只有确认名为 `personal` 的 marketplace 来源就是本仓库、并且不再需要其中其他插件时，才移除该 marketplace 来源。

## 八、常见问题

### 安装后找不到 Skill

先运行：

```bash
codex plugin list --json
```

确认 `ai-talk@personal` 已安装且启用，然后新建对话。不要在安装前已经打开的旧对话中验证。

### `$ai-talk` 和 `$ai-talk:ai-talk` 有什么区别

按本文的免 clone 安装方式使用 `$ai-talk`。单独发布的通用 marketplace 副本使用 `$ai-talk:ai-talk`；两者功能定位相同，不要在同一条指令中同时调用。

### 为什么 AI Talk 没有直接修改代码

这是预期行为。主 Skill 只负责理解需求和生成提示词，避免在需求尚未整理清楚时直接执行。需要把它输出的完整 `text` 代码块交给后续 Codex。

### 为什么普通 UI 任务没有自动运行 Playwright

UI 自测是独立的可选 Skill。只有显式调用 `$ai-talk:ui-self-check`，或在主 Skill 的需求中明确写出“需要 UI 自测、浏览器检查、Playwright 验证或截图对比”，才会安排浏览器检查。

### 能否让 UI 自测不修改代码

可以。在调用中明确写“只检查不修改”“只报告”或 `review`。

### AI Talk 会扫描整个项目或打开外部链接吗

不会。主 Skill 最多有界读取 3 个明确指定的本地文件，不扫描项目，也不打开 Figma、飞书或其他外部链接。外部资料会作为后续执行材料写入提示词。
