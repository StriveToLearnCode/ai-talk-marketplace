# AI Talk 新线程验收

每个用例在刷新 cachebuster、重新安装插件后的全新 Codex 对话中运行。记录处理路径、起止时间、工具调用和最终输出。

## 1. 明确文件修改快速生成

输入：

```text
$ai-talk 请修改 apps/short/20260724-dragon/pages-0/recharge/mods/tab1/mod1.vue，将模板中残留的 runtime-mod-loader(...) Pug 风格代码改为合法的 Vue HTML 组件标签写法。保留现有有效改动、组件参数和业务语义，不要修改无关文件；完成后只对目标文件执行 eslint --fix 和 prettier --write，不执行全量 vue-tsc，不要 stage、commit 或 push。
```

通过条件：

- 处理路径为 `direct`，一次响应生成最终话术，总耗时目标为 15 秒内。
- 不读取目标文件、项目规则或 reference，不运行 `collect_context.py`，不调用其他 Skill。
- 不自行增加 Vue 版本、项目运行时或文件内容等项目事实。
- 最终话术保留目标文件、具体修改、保留边界和验证限制。

## 2. Bug 定位快速生成

输入：

```text
$ai-talk 轮播图偶尔不切换，先帮我整理成定位任务，不要修改代码。
```

通过条件：识别 `direct + bug_debugging + analyze`；不读取 Bug reference、不运行项目命令、不调用调试 Skill；最终话术保留现象和“只分析不修改”的边界，不把猜测写成根因。

## 3. 简单 review 快速生成

输入：

```text
$ai-talk 审查 src/utils/reward.ts 最近的改动，重点看行为回归和缺失测试，只审查不要修改。
```

通过条件：识别 `direct + review`；零项目命令、零额外 Skill、零 reference 读取；最终话术保留文件、关注点和只审查边界。

## 4. 非阻塞缺失不触发发现

输入：

```text
$ai-talk 修复 src/page.vue 中按钮文案写错的问题，其他内容不要改。
```

通过条件：走 `direct`，不因缺少正确文案而扫描项目；如果正确文案确实会改变任务方向，只询问该阻塞问题，否则直接生成最小话术。

## 5. 公司组件需求进入发现

输入：

```text
$ai-talk 在当前页面开发一个带二次确认、加载态和失败提示的操作入口。
```

前置条件：当前会话提供明确覆盖公司组件检索的专用 Skill，同时存在通用前端 Skill。

通过条件：识别 `discovery`；先调用专用公司组件 Skill，不运行项目本地索引，不使用通用前端 Skill 代替，不在查询中加入用户未提到的组件名称。

## 6. 唯一明确的公司组件

让公司组件 Skill 返回一个具有真实标识和直接匹配证据的明显最佳结果，且没有接近竞争项。

通过条件：直接采用并生成话术；不要求额外选择；明确推荐确定不等于兼容性已验证；不固定罗列组件 API。

## 7. 多个公司组件候选

让公司组件 Skill 返回至少四个相关结果，其中前三个相关性接近。

通过条件：`prompt_state` 为 `draft`；最多展示三个候选；每项只显示组件名称和匹配原因；用户选择前不生成最终话术。选择后只采用所选组件，不自动切换候选。

## 8. 公司组件失败或无结果

分别覆盖没有组件检索 Skill、Skill 读取失败、调用报错、空结果、低相关结果和无真实标识结果。

通过条件：显示“未找到合适的公司封装组件”和真实原因；不运行项目索引补位；只提供“检查当前项目已有实现”或“新建本地组件”。

## 9. 用户选择检查项目

在公司组件无结果后选择“检查当前项目已有实现”。

通过条件：新一轮运行本地索引且不使用 `--defer-project-component-choice`；唯一明确项目组件可直接采用；多个接近结果时最多展示三个候选。

## 10. 公司阶段确需第二来源

让公司组件检索还缺少一个会改变推荐方向的项目规则事实。

通过条件：只有确认本地索引能解决该阻塞后才运行第二来源，并增加 `--defer-project-component-choice`；项目组件不得混入公司候选。

## 11. 新建本地组件

在公司组件无结果后选择“新建本地组件”。

通过条件：直接生成限定在当前项目内实现的话术，不运行本地索引，不引入公司组件依赖，不补充用户未说明的组件能力。

## 12. 接口契约发现

输入：

```text
$ai-talk 根据项目里的 OpenAPI 文档接入榜单接口，不要编造字段。
```

通过条件：识别 `discovery + api_integration + modify_and_verify`；只选择能取得权威契约的专用 Skill 或项目来源；以真实文档为准，不默认同时运行 Skill 和本地索引，不编造字段。

## 13. 严格事实与能力边界

让公司组件文档说明支持标题、内容、按钮、多个事件和数据结构，但用户只要求普通弹窗。

通过条件：检索结果可说明组件名称和匹配原因；最终话术不得把可选能力写成用户要求，也不得罗列完整 props 或事件。

## 14. 输出契约

完成任意 `prompt_state: ready` 任务。

通过条件：输出一屏摘要、一个 `text` 代码块和“任务话术已生成，当前尚未执行代码修改”；不输出确认、取消或开始按钮，不执行最终任务。

## 15. 声明式需求默认执行

输入：

```text
$ai-talk 这部分需要奖励预览。目标文件：apps/short/20260724-dragon/pages-O/recharge/mods/tab2/mod1.vue。点击不同奖励时预览当前点击的奖励，不要修改无关代码。
```

并附上目标区域截图。项目 `.agents/skills` 中同时存在 `gen-code`、`gen-frontend-plan`、`custom-components-skill` 和通用 Vue 指南，普通能力索引中存在大量组件与历史实现。

通过条件：

- 识别为 `discovery + modify_and_verify`，只运行 `.agents/skills` 的 Skill-only 索引，目标耗时 1 秒内；不运行 `collect_context.py`，不扫描普通组件、模板或历史实现。
- `gen-code` 为首位 Skill 候选，不选择 `gen-frontend-plan`、`custom-components-skill` 或通用 Vue 指南；普通能力 `--limit` 不得挤掉 Skill 候选。
- 最终话术包含 `$gen-code`、真实 Skill 路径、`local-patch`、`incremental`、目标文件、直接修改和验证要求；不得写“先确认数据源和调用方式，再给出实现方案”。
- 最终话术要求 `$gen-code` 读取 `docs/knowledge/component-registry.md` 和真实组件文档后优先复用已有公司组件，不绕过注册表创建平行实现。
- AI Talk 不直接指定 `ui-prop-wrapper` 或其他具体组件；组件选择由 `$gen-code` 根据真实注册表和文档完成。
- 端到端执行后，点击不同奖励应预览当前循环项；若组件在 `v-for="reward in previewRewardList"` 中绑定奖励 id，应使用 `reward.id`，不得使用列表对象的 `previewRewardList.id`。
- 完整话术目标耗时 30 秒内；AI Talk 阶段不修改业务文件。
