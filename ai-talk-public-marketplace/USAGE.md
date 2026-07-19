# AI Talk 使用说明

AI Talk 用来把一段研发需求整理成可核对、可直接交接的执行提示。它会保留用户原话、读取与任务直接相关的项目上下文，并给出目标 Skill、执行要求、限制和未确认项。

它采用两步流程：第一步只分析，不改代码；你确认协议没有偏离需求后，再让 Codex 开始执行。

## 30 秒上手

1. 在 Codex 中打开需要处理的项目。
2. 在对话框输入 `$ai-talk:ai-talk`，后面直接写研发任务。
3. 检查 AI Talk 输出的目标 Skill、用户原话、已确认上下文和限制。
4. 确认无误后，在下一条消息中输入 `开始执行`。

例如：

```text
$ai-talk:ai-talk 修复 src/components/reward-card.vue 中第三个奖励没有显示的问题
```

AI Talk 本轮只生成协议，不会修改项目。要继续实施，请单独发送：

```text
开始执行
```

## 安装

### 收到 `ai-talk-public-marketplace` 文件夹时

先取得该文件夹的绝对路径，再在终端执行：

```bash
codex plugin marketplace add /绝对路径/ai-talk-public-marketplace
codex plugin add ai-talk@ai-talk-marketplace
```

安装完成后新建一个 Codex 会话。如果仍不能调用，重启 Codex。

可以用下面的命令确认是否安装成功：

```bash
codex plugin list
```

列表中出现 `ai-talk` 即表示安装成功。

> 如果拿到的是完整源码仓库，请把第一条命令的路径指向仓库内的 `ai-talk-public-marketplace` 目录。

### CLI 输出格式

路由脚本默认输出文本，可直接交给后续 Codex。机器调用需要显式增加 `--format json`；调试和测试使用 `--debug-json`，它会输出 JSON 并增加候选评分、索引和读取明细。普通文本和 `--format json` 都不包含调试评分。

## 怎么描述任务

最推荐的写法是：

```text
$ai-talk:ai-talk <要达到的结果> + <目标文件或模块> + <已知信息> + <不能做什么>
```

不需要每项都写，但信息越具体，生成的协议越容易直接执行。

```text
$ai-talk:ai-talk 在 banner-spin.vue 的积分阶段接入 PROGRESS_TASK_ID: 7，沿用当前方式展示进度和奖励，只修改这个功能的必要文件
```

也可以随消息附上截图、设计稿、接口文档或选中的代码，并说明附件是什么：

```text
$ai-talk:ai-talk 修复领取后蒙层没有出现的问题。附件是当前页面截图，目标文件是 src/components/reward-item.vue，不要改接口字段
```

### 常用示例

排查显示异常：

```text
$ai-talk:ai-talk 第三个奖励没有显示，目标文件是 src/components/reward-list.vue
```

核对接口状态：

```text
$ai-talk:ai-talk 接口返回 state=0，但页面显示已领取，请排查状态展示逻辑，不要先假设 state=0 的业务含义
```

修改已有功能：

```text
$ai-talk:ai-talk 奖励领取后增加 icon/mask 蒙层，复用当前奖励节点的结构
```

新增 UI：

```text
$ai-talk:ai-talk 在活动页新增规则弹窗，先参考项目现有弹窗，不扩展未提到的业务功能
```

## 如何看输出

AI Talk 默认输出以下栏目：

- `使用 Skill`：与目标产物匹配且已安装的 Skill；缺失时明确说明所需 Skill。
- `用户原始目标`：去掉调用标记后的用户原话，不改写技术标识和限制。
- `已确认上下文`：真实证据、目标文件、项目规则和直接依赖。
- `执行要求`：后续 Codex 可直接遵循的执行重点和建议检索。
- `限制`：只读边界或必要修改范围。
- `未确认项`：真正影响执行的信息，以及缺失 Skill 的处理方法。

示例输出：

```text
使用 Skill：gen-code

用户原始目标：
修复 src/components/reward-list.vue 中第三个奖励没有显示的问题

已确认上下文：
- target_file：src/components/reward-list.vue

执行要求：
- 先确认目标代码和根因，再做最小范围实现或修复。
- 优先检索目标文件的直接引用、状态分支和相邻测试。

限制：
- 范围限于 src/components/reward-list.vue 及必要的直接依赖。

未确认项：
- 无。
```

## 确认后开始执行

先检查目标和边界是否正确。如果需要调整，直接指出变化，再重新调用一次 AI Talk：

```text
$ai-talk:ai-talk 目标改为只修复移动端，并且不要修改 reward-list.vue 之外的文件
```

协议确认无误后，必须在下一条独立消息中明确授权。可使用：

```text
开始执行
```

也可以使用 `直接修改`、`使用这个协议继续`；如果协议明确推荐了 `gen-code`，可以输入 `调用 gen-code 执行`。

## 使用边界

- AI Talk 只读取你明确指出的目标，以及与目标直接相关的少量项目文件。
- 它不会因为目标文件缺失而扫描整个仓库，请补充正确的相对路径。
- 截图只能说明页面表现；接口字段含义、状态映射和问题根因仍需要代码或文档证据。
- 第一轮不会修改文件，也不会自动调用推荐的 Skill。这是正常行为。

## 常见问题

### 输入 `$ai-talk:ai-talk` 后没有触发

先运行 `codex plugin list` 确认已安装，再新建会话或重启 Codex。调用时保留开头的 `$`，并写成 `$ai-talk:ai-talk`。

### 提示找不到目标文件

确认 Codex 当前打开的是正确项目，并尽量填写相对项目根目录的路径，例如 `src/components/reward-card.vue`，不要只写一个可能重名的文件名。

### 输出内容太少

补充目标文件、复现现象、已知接口信息、截图角色和修改限制。AI Talk 不会用猜测填补缺失信息。

### 为什么提示目标 Skill 未找到

路由只会推荐真实索引中存在、且职责与目标产物一致的 Skill。它不会兜底到其他职责；请按“未确认项”安装或启用所需 Skill，或通过 `--source-root` 提供批准的 Skill 目录后重试。

### 为什么没有直接改代码

AI Talk 默认先生成协议，避免理解偏差。检查协议后，在下一条消息中输入 `开始执行` 即可继续。
