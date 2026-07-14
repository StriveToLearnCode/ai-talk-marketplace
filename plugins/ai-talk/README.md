# AI Talk Plugin

AI Talk 将自然语言研发需求整理成只包含有来源事实、可直接交给 Codex 的任务话术。它先选择内部处理路径：明确任务走 `direct` 并立即输出；只有需要组件选型、能力复用、接口契约或关键项目事实时才走 `discovery`。

AI Talk 不执行最终开发任务，不修改业务代码，也不提供任务确认卡或伪按钮。

## 工作流

```text
理解需求
→ direct：零项目命令、零额外 Skill，直接生成
→ discovery：按需选择专用 Skill 或项目本地索引
→ 组件需求优先检索公司封装组件
→ 确定则采用，存疑则展示最多 3 个候选
→ 区分用户事实、项目事实、检索事实和阻塞性未知
→ 生成任务话术
```

## 快速路径

目标文件或范围、具体修改和保留边界已明确时，AI Talk 只根据当前输入和完整对话生成话术。普通 Bug 定位和简单代码 review 在信息充分时同样直接生成。

快速路径不读取项目文件、目标文件或 reference，不运行 `collect_context.py`，不调用其他 Skill，也不生成未经读取的项目事实。简单请求以一次响应、15 秒内完成为目标。

## 本地上下文

本地索引只在 `discovery` 确实需要项目事实或复用候选时运行：

```bash
python3 skills/ai-talk/scripts/collect_context.py \
  --root /path/to/project \
  --query '查找可复用的奖励弹窗实现' \
  --related apps/short/current-activity
```

脚本 JSON schema 保持不变。索引只扫描项目根目录和显式 `--source-root`，不会扫描用户 Skill 目录或插件缓存。

## 公司组件检索

- 不预设 Skill 或组件名称，只根据用户事实和已有项目事实检索。
- 公司组件 Skill 是首选发现来源，不默认同时运行项目本地索引。
- 唯一明显最佳结果可直接采用，但仍要求后续验证兼容性。
- 多个结果接近时最多展示 3 个候选，每项只显示组件名称和匹配原因。
- 没有合适公司组件时，让用户选择检查当前项目或新建本地组件，不自动降级。

## 事实边界

- `direct` 只使用用户事实，不补充技术栈、文件内容或项目规范。
- `discovery` 读取的项目事实必须直接相关并带来源。
- 组件支持某项能力不代表用户要求该能力。
- 非阻塞缺失项省略；用户未明确时不生成验收标准。

## 输出

AI Talk 输出一屏任务摘要、一个完整任务话术代码块，以及：

```text
任务话术已生成，当前尚未执行代码修改。
```

## 安全边界

- AI Talk 不运行 formatter、lint、测试、构建、开发服务器、部署或提交。
- 被调用 Skill 只执行与当前任务有关的只读发现步骤。
- 不读取 `.env`、密钥、依赖目录和构建产物。
- 不把发现结果写成兼容性结论或用户未提出的业务需求。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/ai-talk/tests -v
node --test skills/ai-talk/tests/test_build_capability_index.mjs
```

人工新线程验收见 `tests/acceptance-cases.md`。
