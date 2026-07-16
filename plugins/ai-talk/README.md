# AI Talk Plugin

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

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/ai-talk/tests -v
node --test skills/ai-talk/tests/*.mjs
```
