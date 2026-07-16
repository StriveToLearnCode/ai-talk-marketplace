# AI Talk Plugin

<<<<<<< HEAD
AI Talk 将研发任务整理为最小 Task Contract，并使用以下 Gap 结构：

```json
{
  "type": "state_mapping",
  "reason": "接口状态值与页面已领取表现之间的映射关系尚未确认。",
  "blocking": false,
  "suggested_source": "project"
}
```

默认输出展示用户目标、已确认上下文、研发概念、关系与冲突、按需出现的上下文缺口、任务边界和验收标准。默认输出不展示内部字段、JSON、绝对路径、评分、检索计划或执行 Skill。

## 运行

```bash
node skills/ai-talk/scripts/route-company-skills.mjs \
  --query '奖励获取后增加蒙层，资源 icon/mask'
```

需要检查结构化结果时增加 `--debug-json`。`--root` 等历史路由参数仅为兼容而接受，不会触发项目读取或 Skill 路由。
=======
AI Talk 是中文研发语义规范化协议生成器。它将用户口语、截图、文件和代码上下文整理为：

1. 一句规范化任务目标
2. 已确认的研发对象、状态、视觉效果、资源、配置变量和接口字段
3. 简洁的关键关系
4. 贴合公司知识的中文检索语义
5. 真实实现约束
6. 高置信建议 Skill

内部 retrieval query group、canonical entity、路由评分和候选不会进入默认输出。

```bash
node skills/ai-talk/scripts/route-company-skills.mjs \
  --root /path/to/project \
  --query '在 banner-spin.vue 中，积分阶段 PROGRESS_TASK_ID: 7，然后一样展示进度和奖励'
```

真实附件可按内容传入：

```bash
--evidence-type 'visual=弹窗视觉稿'
--evidence-type 'interaction=交互流程'
--evidence-type 'api=state=0'
--evidence-type 'screenshot=页面显示已领取'
```

普通文本中的“图片、图标、背景图”不会被识别为截图。`icon/mask` 等资源路径保持原样。`state=0` 只会形成接口字段事实和状态映射检索语义，不会被推断成具体业务状态。

默认索引项目 `.agents/skills/**/SKILL.md`、显式批准的公司 Skill 根和插件自带 `ui-self-check`。建议 Skill 不构成执行授权。
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/ai-talk/tests -v
node --test skills/ai-talk/tests/*.mjs
```
