# AI Talk 状态协议

需要保存、恢复或预检任务状态时完整读取本文件。

## 状态结构

```yaml
task_state:
  task_key: reward-dialog/request-once
  status: active
  current_goal: { value: 奖励弹窗只请求一次并正常展示, source: user }
  change_boundaries:
    - { kind: constraint, value: 只修改 reward-dialog 调用链, source: user }
    - { kind: prohibited, value: 不发布, source: user }
  verified_facts:
    - value: RewardDialog.vue 负责目标弹窗
      source: source:apps/short/20260709/pages-F/components/RewardDialog.vue
      verified_by: source
      evidence: 页面入口直接注册并渲染该组件
    - value: 弹窗当前视觉结果不能回归
      source: user
      verified_by: user
      protected: true
  pending_checks:
    - { value: 验证接口只触发一次, source: acceptance }
    - { value: 验证弹窗正常展示, source: acceptance }
  completion_criteria:
    - { value: 接口只触发一次且弹窗正常展示, source: user }
  next_action: { value: 定位重复触发入口, source: conversation }
```

## 字段约束

- `task_key` 使用稳定路径、模块或简短任务名；`status` 只用 `active | blocked | complete`。
- `current_goal` 和非完成状态的 `next_action` 各只能有一个。`complete` 不含 `next_action`，也不能残留 `pending_checks`。
- `change_boundaries.kind` 只用 `allowed | prohibited | constraint`。
- `verified_facts.verified_by` 只用 `source | runtime | user`。源码事实引用最小路径或符号，运行事实写明命令或页面操作及结果；只有用户明确要求不可回归的结果或验证仍有效的结果才加 `protected: true`。
- `pending_checks` 只保留未执行或证据不足的验证。验证完成后删除该项，并将结果压缩到 `verified_facts`；失败时更新唯一下一步。
- `completion_criteria` 保持稳定，除非用户改变验收。不能用“代码已修改”作为完成条件。

每个数组最多 8 项。不要保存日志、文件正文、完整响应、截图内容、secret、token、cookie、推理过程或无证据假设，也不要增加平行账本。

## 定位绑定

脚本从当前分支和目标文件自动保存以下工作区事实：仓库根目录、分支、活动目录、页面目录、最近的 `AGENTS.md`、目标文件指纹。

```text
node <skill-dir>/scripts/collect-task-context.mjs --root <工作区> [--target <目标文件> ...]
```

活动仓库内，`act-<name>` 对应 `apps/short/<name>`，`mdc-<id>` 对应 `apps/mdc/<id>`；只有目录真实存在才采用。用户路径优先，但与分支推导冲突时先确认。页面目录优先从当前路径或目标文件的 `pages-*` 祖先获得；活动下只有一个页面目录时可自动采用，多个候选时不猜。

## 保存与恢复

将 `<skill-dir>` 解析为包含本 Skill 根 `SKILL.md` 的绝对目录：

```text
node <skill-dir>/scripts/task-state.mjs save --root <工作区> --task <task_key> [--target <目标文件> ...] < state.json
node <skill-dir>/scripts/task-state.mjs load --root <工作区> --task <task_key>
node <skill-dir>/scripts/task-state.mjs list --root <工作区>
```

状态默认保存在 `~/.codex/ai-talk-state/`，不向业务仓库写文件。首次形成跨轮状态、用户纠正或范围变化、事实或待验证项变化、上下文压缩及交接前保存；内容未变化时不重复写入。脚本可读取旧版状态并迁移到当前六字段结构。

恢复时优先 `load`，不要要求用户重述。task key 不明时先 `list`；只有一个与当前目标一致的活动状态时直接恢复，多个候选无法排除时才询问。不同任务不能合并。

## 修改前预检

已有状态时，在本轮首次修改目标代码前及上下文恢复后的首次修改前运行：

```text
node <skill-dir>/scripts/task-state.mjs preflight --root <工作区> --task <task_key>
```

先检查输出中的修改边界和不可回归事实，再编辑。目标文件指纹、分支或最近的 `AGENTS.md` 变化时，重读当前规则和源码并合并修改；变化不自动撤销保护项，也不证明需求改变。

## 完成闭环

每完成一步按此顺序更新：

1. 从 `pending_checks` 删除已执行项。
2. 将可复用结论写入 `verified_facts`，附来源和验证方式。
3. 仍有待验证项时只保留一个 `next_action`。
4. 所有完成条件均有有效证据且 `pending_checks` 为空时，设为 `complete` 并删除 `next_action`。

用户最新要求覆盖冲突旧状态。相关源码、运行环境或页面状态变化导致证据失效时，移除对应事实并重新加入 `pending_checks`。
