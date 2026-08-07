# AI Talk 状态协议

需要持久化、恢复、修改或预检任务状态时，完整读取本文件。

## 目录

- 状态结构
- 字段约束
- 持久化与恢复
- 修改前预检
- 来源与新鲜度
- 表达示例

## 状态结构

只持久化会改变下一步的信息：

```yaml
task_state:
  task_key: lottery/can-lottery-times
  status: active
  goal: { value: 补四个奖励名称, source: user }
  confirmed_results:
    - { value: 四个奖励位置已对准，不能再动, source: user, status: protected }
  corrections:
    - { value: 名称不能只依赖接口；接口无名称时从道具配置取, source: user }
  boundaries:
    - { kind: allowed, value: 可以改本地代码, source: user }
    - { kind: prohibited, value: 不发布, source: user }
    - { kind: prohibited, value: 不覆盖其他改动, source: user }
  acceptance:
    - { value: 四个奖励名称都显示, status: pending, source: user }
    - { value: 四个奖励位置保持不变, status: pending, source: user }
  next_action: { value: 只补名称并在页面验证, source: conversation }
  bindings:
    - { name: text, value: lottery/can-lottery-times, source: user }
```

## 字段约束

- `task_key` 使用用户给出的稳定路径、模块名或业务标识；没有稳定标识时使用简短任务名，不编造业务 ID。
- `status` 只用 `active | blocked | complete`。
- `goal` 永远只有一个，只描述当前产品结果；目标变化时替换旧目标。
- `confirmed_results` 只保存用户确认或验证证据确认、且仍可能回归的结果，固定为 `status: protected`。纯观察、推断和 mock 不得进入。
- `corrections` 只保存仍适用且会改变下一步的用户纠正；新规则取代旧规则时删除旧规则。
- `boundaries` 只保存会限制下一步的允许项和禁止项。
- `acceptance` 状态只用 `pending | verified`；证据失效时改回 `pending`，不保存测试流水。
- `next_action` 永远只有一个且可直接执行；完成后替换或删除。`complete` 状态不再创建下一动作。
- `bindings` 只保存下一步需复用且来源明确的定位信息，不保存文件正文或完整响应。

数组中每类最多 8 项。不再影响下一步、已被替代或只解释历史的内容立即删除。不要增加 `facts / evidence / hypotheses / decisions / changes / todos / risks / references / user_state` 等平行账本。证据只压缩为支撑保护项或验收状态的一句话，放在对应项的 `evidence` 中。

## 持久化与恢复

将 `<skill-dir>` 解析为包含根 `SKILL.md` 的绝对目录。不能只在对话中声称“已记录”；需要状态时运行随 Skill 提供的脚本：

```text
node <skill-dir>/scripts/task-state.mjs save --root <活动目录> --task <task_key> [--target <目标文件> ...] < state.json
node <skill-dir>/scripts/task-state.mjs load --root <活动目录> --task <task_key>
node <skill-dir>/scripts/task-state.mjs list --root <活动目录>
```

`save` 从 stdin 读取 JSON，写入绝对活动目录、当前分支、目标文件指纹和更新时间。默认存储位于 `~/.codex/ai-talk-state/`，不会制造业务仓库文件；写入使用原子替换，目录和文件仅当前用户可访问。

在以下时点保存：首次形成完整状态、用户纠正或边界变化后、验收状态变化后、上下文压缩或交接前。内容未变化时不重复写入。完成后保存 `status: complete` 和最终验收；新需求使用新 `task_key` 或明确重新激活。

恢复时先 `load`，不要要求用户重述。没有 task key 时先 `list`；只有一个仍活动且与当前目标一致的状态时直接恢复，多个候选不能唯一匹配时只问会改变结果的问题。不得合并不同任务的状态。

## 修改前预检

有持久状态时，在本轮首次修改目标代码前运行：

```text
node <skill-dir>/scripts/task-state.mjs preflight --root <活动目录> --task <task_key>
```

`preflight` 输出唯一目标、不可回归项、纠正、操作边界、验收和唯一下一步，并比较保存时的目标文件指纹。先采用其中的不可回归项和禁止边界，再基于当前文件合并修改。

指纹变化时，说明哪些目标文件在基线后变化，修改者一律记为未知；变化不自动废除保护项，也不证明用户改变了需求。

## 来源与新鲜度

用户最新明确要求高于旧实现、旧交接和临时方案。用户确认代表需求权威，但不自动证明远端现状；代码观察、接口响应和页面截图只能更新对应绑定或验收，不能扩大目标、范围或授权。

保护项只在成立条件仍有效时复用。目标、视口、页面状态、相关文件或验证环境变化且使证据失效时，将验收改回 `pending`；用户撤销或新结果取代保护项时删除旧项。恢复后始终以当前消息覆盖冲突字段。

组件来源优先级为：用户明确指定 > 已确认绑定 > 当前代码 import 或注册映射 > 同项目同类实现 > 组件文档。未确认时不保存为绑定，不得因本地 mock 不渲染就替换用户指定组件。

## 表达示例

不要逐字段播报状态，也不固定使用 `AI Talk 已绑定` 或 `AI Talk 已记录`。

有效的下一步提示：

> 位置现在对了，不要再动布局。只补四个奖励的名称，接口没名称时从道具配置取，改完页面验证，不发布。

修改前保护提示：

> 改动只补奖励名称；四个奖励位置已确认正确，布局是本轮不可回归项。接口无名称时读取道具配置，完成后同时验证名称和位置。

完成提示：

> 四个奖励名称已经显示，原有位置保持不变；名称缺失时会从道具配置兜底。页面已验证，没有发布。
