# AI Talk 安装与使用说明

显式调用：

```text
$ai-talk <研发任务>
```

AI Talk 支持 `feature_create`、`bug_fix`、`ui_modify`、`ui_inspection` 和 `planning`。它从用户原话、真实附件和编辑器已提供的上下文中提取事实，只标注真正影响实现方向的缺口。

阻塞缺口最多一个，需要用户确认；非阻塞缺口不打断工作流，由后续 Codex 在执行阶段自行验证。没有真实缺口时，Task Contract 会省略“上下文缺口”区域。

AI Talk 不搜索项目、不读取公司 Docs、不调用 Skill，也不输出检索计划。后续 Codex 根据 Task Contract 自行检索和实施。

## 更新

```bash
codex plugin marketplace upgrade personal
codex plugin add ai-talk@personal
```

更新后新建 Codex 对话。
