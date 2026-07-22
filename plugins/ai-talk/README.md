# AI Talk Plugin

AI Talk 用于开发前的需求澄清和只读诊断分诊。它保留用户原话：普通需求只处理会改变实施结果的问题；“为什么”“前端还是后端”等请求沿控制、数据、渲染三层定位。

运行规则：

1. 一次最多询问 2 个关键问题。
2. 最多提醒 3 条由当前任务支持的具体风险。
3. 澄清模式不读取仓库；诊断模式只读取用户指定位置及故障链必要关联，始终不修改代码。
4. 不推荐或调用下游 Skill。
5. 需求明确后输出“AI Talk 到此结束，交给代码 Agent 实现。”并停止。

```text
$ai-talk:ai-talk 这两部分的用户头像都需要 pag/user 溜光
```

该场景只需确认页面范围和“每个头像独立播放还是列表共用实例”，并提醒 `ui-pag` 实例上限、PAG name 唯一性与覆盖层点击风险。

`skills/ai-talk/scripts/route-company-skills.mjs` 与 `references/legacy-router.md` 仅用于 0.4 CLI 兼容和历史测试，正常 Skill 对话不得调用。

诊断请求固定使用 `inspect_only`，不推荐 `gen-code`。Handoff 保存诊断事实与定责条件；用户说“执行”时直接续接上一轮证据，不重新扫描或升级为修改模式。
