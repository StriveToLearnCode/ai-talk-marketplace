# AI Talk 使用说明

AI Talk 用来把研发需求整理成知识优先、可直接交接的任务协议。它先判断完成任务必须理解什么，再从真实项目上下文中选择最相关的检索入口。

它根据原话直接选择执行方式：明确修改就修改并验证，明确排查就只定位，明确要求先出方案则在方案完成后确认一次。

## 30 秒上手

1. 在 Codex 中打开需要处理的项目。
2. 在对话框输入 `$ai-talk:ai-talk`，后面直接写研发任务。
3. 查看 AI Talk 输出的增量上下文、AI 判断、公司检索入口和下一 Skill。
4. 使用“开发、实现、修改、修复”等动作词时，无需再次授权。

例如：

```text
$ai-talk:ai-talk 修复 src/components/reward-card.vue 中第三个奖励没有显示的问题
```

该请求会直接得到 `modify_and_verify`。宿主支持下游 Skill handoff 时同轮继续；不支持时只显示一个明确的建议 Skill 入口。

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

路由脚本默认输出精简 Task Handoff，可直接交给后续 Codex。原始请求、事实、约束、验收和非阻塞 unknown 保留在 `execution_plan`，不在文本中展开。机器调用需要显式增加 `--format json`；调试和测试使用 `--debug-json`。

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

- `已补充上下文`：最多 2 条由原话、附件或代码支持的增量事实。
- `AI 判断`：1～2 句说明任务类型、应复用的能力，以及确实需要新增或调整的内容。
- `公司检索入口`：按“知识对象 → 真实入口（原因）”展示最多 3 个有证据入口；找不到真实入口的对象不展示。
- `需要确认`：只在存在真正阻塞时出现，最多 1 条。
- `下一步`：当前阶段和建议 Skill。

不会继续新增栏目。截图、资源、页面、目录、组件扫描、依赖、Docs、AGENTS、约束和验收只保留在 JSON 协议中。

示例输出：

```text
🧩 已补充上下文
- 图片关系：图 3 为目标图；图 1、图 2、图 4 为参考图

🧠 AI 判断
这是现有奖励横幅的积分阶段扩展。优先复用进度、奖励展示和跳转能力；新增重点是图 3 的守护者区域及 RTL 布局。

🔍 公司检索入口
📈 积分进度
→ level-progress.vue（复用进度与阶段状态）
🎁 奖励展示
→ RewardNode（复用展示结构）
🔗 半屏 H5
→ openH5（复用跳转方式）
↔️ RTL 布局
→ activity-banner.vue（复用布局规则）

▶ 下一步
当前阶段：修改代码
建议 Skill：gen-code（修改并验证）
```

## 执行模式

明确动作词会直接决定 mode：

- `开发`、`实现`、`新增`、`接入`、`修改`、`修复`、`直接改`：`modify_and_verify`
- `排查`、`为什么`、`分析`、`定位原因`、`只看看`：`inspect_only`
- `先给方案，确认后再改`、`先分析原因，确认后再改`：`plan_then_execute`
- `帮我看看`、`处理一下`：无法判断时最多确认一次

如果需要调整目标或边界，直接指出变化：

```text
$ai-talk:ai-talk 目标改为只修复移动端，并且不要修改 reward-list.vue 之外的文件
```

只有 `plan_then_execute` 在方案完成后需要一次确认。机器集成可把上一轮 `--format json` 结果保存为 JSON，并在确认轮调用同一入口：

```bash
node scripts/route-company-skills.mjs \
  --root '<项目根目录>' \
  --query '开始执行' \
  --previous-contract '<上一轮 JSON 文件>'
```

`modify_and_verify` 首轮就写入 `route.authorization=authorized`。确认轮只用于把 `plan_then_execute` 更新为修改并验证。

## 使用边界

- AI Talk 只在项目根内建立受文件数、字节数和文件类型限制的检索索引。
- 项目规则和普通依赖可以参与内部判断，但不会因为真实就自动展示。
- 截图只能说明页面表现；接口字段含义、状态映射和问题根因仍需要代码或文档证据。
- 路由脚本本身只生成 handoff；宿主支持下游 Skill 调用时，`modify_and_verify` 同轮继续，否则文本中只保留一个 Skill 入口。

## 常见问题

### 输入 `$ai-talk:ai-talk` 后没有触发

先运行 `codex plugin list` 确认已安装，再新建会话或重启 Codex。调用时保留开头的 `$`，并写成 `$ai-talk:ai-talk`。

### 提示找不到目标文件

确认 Codex 当前打开的是正确项目，并尽量填写相对项目根目录的路径，例如 `src/components/reward-card.vue`，不要只写一个可能重名的文件名。

### 输出内容太少

补充目标文件、复现现象、已知接口信息、截图角色和修改限制。没有真实入口时，AI Talk 不会用“同类实现”或“相关 Skill”等泛化项填满列表。

### 为什么提示目标 Skill 未找到

路由只会推荐真实索引中存在、且职责与目标产物一致的 Skill。它不会兜底到其他职责；请按“待确认”安装或启用所需 Skill，或通过 `--source-root` 提供批准的 Skill 目录后重试。

### 为什么没有直接改代码

先确认原话包含明确修改动作词，并检查建议 Skill 是否已安装。若 mode 已是 `modify_and_verify` 但未继续执行，说明当前宿主不支持自动 handoff；此时只使用输出中的唯一建议 Skill 入口。
