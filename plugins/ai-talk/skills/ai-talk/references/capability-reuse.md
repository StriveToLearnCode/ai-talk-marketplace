# 能力发现与复用

在最终任务话术生成前，通过一次轻量索引建立能力组合。AI Talk 自动采用明确能力，只有组件、utility、同类实现或复用方式存在真实歧义时才让用户选择。AI Talk 不打开业务源码，不执行兼容性验证。

## 统一入口

只运行一次；这是 AI Talk 阶段唯一允许的项目命令：

```bash
python3 <AI Talk Skill 目录>/scripts/collect_context.py \
  --root <项目根目录> \
  --query '<用户需求与已确认补充>'
```

用户给出路径时增加 `--related`；已知公司目录时增加 `--source-root label=/absolute/path`。不要猜测公司目录。

脚本在内部收集有限项目说明、包管理器、scripts、Git 元数据、相关路径和能力索引。它跳过 `.env`、密钥、`node_modules` 和构建产物；失败时返回 warning 并允许继续。不要再运行 `rg`、`find`、Git 定位、构建、测试或其他项目命令。

## 自动采用

直接使用统一脚本返回的元数据，不额外读取候选文件、真实消费者、测试或同类页面：

- 主 Skill、项目规则和适用 Prompt 使用 `auto_selected`。
- 唯一高相关的项目内组件或 utility 自动使用 `prefer_reuse`。
- 唯一相关的项目内历史实现自动使用 `prefer_reference`。
- 自动项使用 `selection_source: ai_talk`，但不设置执行验证状态。

每项保留：

- 名称、类型、来源和真实路径。
- 匹配原因。
- `candidate_reuse`、`candidate_reference` 或 `low_relevance`。
- 待确认后的 Codex 验证的 API、props、数据结构、依赖、配置、样式覆盖和运行环境。
- 强行复用、公共组件改动或依赖不兼容风险。

## 歧义候选

只有以下情况使用 `choice_required`：共享或跨项目组件/方法适配关系不明确；同类型出现多个高相关结果；无法判断应复用还是仅参考。最多展示三个高相关组件或历史实现、两个辅助参考，隐藏低相关结果和完整索引。

## 用户选择

只为 `choice_required` 项等待用户选择，自动项不阻塞话术生成。待选项保持 `user_choice: null`，直到用户明确选择：

- `prefer_reuse`：优先验证复用。
- `prefer_reference`：仅作参考。
- `excluded`：本次排除。

纯文本环境可让用户按编号选择，不要求重新输入完整名称。需要把选择传回脚本时使用可重复参数：

```bash
--capability-choice <id>=prefer_reuse
```

用户选择不能变成 `confirmed_reuse`。没有待选项时直接生成话术并进入 `ready_for_review`；存在未选项时任务保持 `draft`。`execution_validation` 在 AI Talk 阶段必须为 `null`。读取真实代码和验证兼容性的要求只能写进最终任务话术。

## 搜索失败

没有可靠结果时明确说明检查过哪些项目、用户或公司来源。最终话术要求 Codex 再检查目标目录、相关组件和同类实现；确认没有可复用实现后再新增。不得编造能力或用低相关结果填满名额。
