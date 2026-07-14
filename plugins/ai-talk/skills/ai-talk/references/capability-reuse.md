# 能力发现与复用

只在 AI Talk 已选择 `discovery`，且当前任务确实需要组件、Skill、Prompt、utility、历史实现或项目规则时读取本文件。`direct` 路径禁止读取本文件。

## 1. 选择发现来源

目标项目的 `.agents/skills` 是项目执行 Skill 的权威目录；当前会话的 Available Skills 是插件和会话已注册 Skill 的目录。项目本地索引用于搜索项目规则与复用候选。三者按需选择，不是每轮固定执行的多层流程。

1. 新增交互、展示能力或业务逻辑时，先对 `.agents/skills` 运行 Skill-only 索引，选择负责实际代码生成或修改的项目 Skill。
2. 专用 Skill 能直接提供所需事实时，先完整读取其 `SKILL.md` 和必要 reference，并执行相关只读发现流程。
3. 需要项目本地规则、组件、utility、Prompt 或历史实现时，运行完整本地索引。
4. 不得因为查询中出现“开发”“组件”“验证”等常见词调用通用 Skill。
5. 不得默认同时调用专用 Skill 和完整本地索引。只有第一种来源结果不足，且第二种来源能直接解决阻塞时才继续。
6. AI Talk 只读取项目执行 Skill 以确认适用性和模式，不执行其中的修改文件、构建、部署、提交和外部写入动作。

Skill 元数据匹配不等于 Skill 已经被调用。索引中的 `skill_candidates` 只是发现提示；最终话术应写成要求下游 Codex 调用 `$<skill-name>`，AI Talk 不得列为“实际调用 Skill”。

## 2. 公司组件检索

1. 根据用户原话和已经提供的项目事实，调用语义明确覆盖公司组件检索的 Skill；不得为了构造查询先扫描项目。
2. 查询只包含用户明确需求、已有项目事实，以及用户明确给出的目标场景、交互和状态；不得加入猜测的组件名称或功能。
3. 只保留具有真实路径或稳定标识、实际匹配证据且不是 `low_relevance` 的结果。
4. 唯一明显最佳且证据充分的结果可直接采用；缺少关键证据、结果接近或适用边界不清楚时，最多展示三个候选并等待用户选择。
5. 候选只显示组件名称和匹配原因，不显示路径、复用方式、适配项或兼容性结论。
6. 用户选择后，最终话术才写入所选组件的真实路径或标识、来源 Skill 和直接相关证据。组件其余能力不得进入需求，未选择组件不得成为依赖。

推荐确定性和执行兼容性必须分开。直接采用只表示推荐方向明确，`execution_validation` 仍为 `null`。

## 3. 项目本地索引

### 项目 Skill-only 索引

新增交互、展示能力或业务逻辑时只扫描项目 `.agents/skills`：

```bash
node <AI Talk Skill 目录>/scripts/build-capability-index.mjs \
  --root <项目根目录> \
  --skills-only \
  --intent modify_and_verify \
  --skill-limit 10 \
  --query '<用户需求与已确认边界>'
```

`skill_candidates` 独立排序和截断，不受普通能力 `--limit` 影响。局部 UI、交互或逻辑修改应优先匹配描述中明确支持“生成代码、局部生成、加逻辑、local-patch、incremental”的执行 Skill，不得用只生成方案的 Skill、积木组件规范或通用 Vue 指南替代。

选择后完整读取真实 `SKILL.md`，把 `$<skill-name>`、Skill 路径和执行模式写入话术。若 Skill 要求读取 `docs/knowledge/component-registry.md` 或真实组件文档，要求下游 Codex 执行该发现并优先复用已有组件；AI Talk 不指定未经该 Skill 验证的组件名。

### 完整能力索引

仅在需要项目本地发现时运行一次：

```bash
python3 <AI Talk Skill 目录>/scripts/collect_context.py \
  --root <项目根目录> \
  --query '<用户需求与已确认补充>'
```

用户给出项目内路径时增加 `--related`；明确知道公司或团队能力目录时增加 `--source-root label=/absolute/path`。不要猜测公司目录。

公司组件检索阶段默认不运行本地索引。只有另一个阻塞事实确实需要项目索引时，才可继续第二种来源并增加：

```bash
--defer-project-component-choice
```

此时 `task_context.capabilities.project_component_selection_deferred` 为 `true`，项目组件和历史实现不得混入公司候选。用户选择“检查当前项目已有实现”后，在新一轮运行本地索引且不使用该参数，直接启用项目组件选择。

完整索引只扫描项目根目录和显式 `--source-root`；项目 Skill 候选单独来自 `.agents/skills`。它不扫描 `.claude/skills`、`~/.codex/skills`、`~/.cc-switch/skills`、插件缓存或其他用户 Skill 目录。

## 4. 结果处理

保留真实名称、类型、来源、路径或标识、实际查询动作和匹配证据。发现状态使用 `candidate_reuse`、`candidate_reference` 或 `low_relevance`。

用户选择检查项目后，唯一且高相关的项目内组件可使用 `prefer_reuse`，唯一相关历史实现可使用 `prefer_reference`。多个高相关实现、共享能力适配不明或复用方式不清楚时，最多展示三个候选并等待 `prefer_reuse`、`prefer_reference` 或 `excluded`。

实际调用 Skill 的结果优先于本地关键词索引，但只有确实执行了两种发现来源时才合并。组件支持的能力不得扩写成用户需求；不得固定罗列完整组件 API；不得为了强行复用修改无关公共组件。

`confirmed_reuse`、`partial_reuse`、`incompatible` 和 `reference_only` 只能由后续 Codex 读取真实代码并验证后给出。AI Talk 始终保持 `execution_validation: null`。

## 5. 失败与空结果

- 公司组件 Skill 不存在、读取或调用失败、返回空结果或只有低相关结果：显示“未找到合适的公司封装组件”和真实原因，只提供“检查当前项目已有实现”或“新建本地组件”，不得自动展示项目组件。
- 用户拒绝全部公司候选：按公司组件无结果处理。
- 本地索引失败：说明失败范围，最终话术要求后续 Codex 重新检查目标目录和同类实现。
