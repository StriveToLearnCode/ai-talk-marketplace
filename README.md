# AI Talk

AI Talk 让 AI 开发任务有约定地开始、有边界地执行、有证据地完成：**开始前锁定需求，执行中守住边界，完成后逐项对账。** 安装后直接描述研发需求，不需要命令前缀；状态询问、纯引用和非研发消息仍原样放行。

```text
研发请求
→ 锁定：明确任务一行直接执行；复杂任务展示目标 / 边界 / 验收
→ 守边界：只在只读、范围或外部写入边界真实生效时提示
→ 对账：逐项报告完成、未完成、未验证，以及真实验证证据
```

明确、可逆的局部修改走无契约 Fast Path，开始时只显示 `AI Talk · 目标明确，直接执行`。复杂任务使用 `RequirementContract 1.4` 在实施前锁定目标、边界和验收，但不向用户展示协议字段或 YAML。只有答案会改变产品结果、数据语义或允许写入范围时才询问一个问题。

“为什么”“只分析”和没有实施要求的纯缺陷陈述保持只读，开始时明确提示不会修改代码、配置或外部系统；随后说“执行”才复用证据转入实施。外部写入必须由当前消息直接授权，或由简短肯定紧邻确认上一轮已列清系统、单一动作和全部目标的提议。

视觉请求先检查已有的新鲜截图标注、DOM 选择、IDE 选区、文件行号或业务 ID；目标唯一时直接继续，多义或陈旧时才请求一次补充。`excluded_scope` 和 `bounded` 范围通过前后工作区快照强制校验，越界时不得声称完成。

每个修改任务最终包含 `AI Talk 对账`：逐项标记目标为已完成、未完成或未验证，并区分静态检查与运行验证。没有 scope guard 证据时只列实际改动范围，不虚构范围保护结论。

Fast Path 仍保持零协议 reference、仓库、contract checker 和 reporter 调用。契约校验器继续确定性检查结构、真实文件与行号、视觉证据、范围冲突和外部写入授权。

## 视觉目标

“这里”“这两部分”“第二个头像”等指代会先尝试由文件行号、IDE 选区、唯一业务 ID、DOM 或截图标注稳定绑定。只有仍存在多个合理候选时才进入视觉契约；视觉目标会保存为稳定 `target_refs`：

- 截图标注保存附件、标注 ID、归一化边界和原图尺寸。
- 选中 DOM 保存当前页面状态、稳定 selector、ordinal 和 DOM fingerprint。
- 当前浏览器页面保存脱敏 URL、route、视口、frame path 和可观察状态。

视觉目标只是入口证据，不自动成为代码 `control_point` 或 `write_scope`。上下文缺失、陈旧或有多个候选时，AI Talk 只请求一次选择、截图标注或 DOM 选择，不根据代码和相似外观猜测。

## 安装

```bash
codex plugin marketplace add StriveToLearnCode/ai-talk-marketplace --ref marketplace
codex plugin add ai-talk@ai-talk-marketplace
```

`marketplace` 分支由 GitHub Actions 在 `master` 测试通过后自动发布，每个版本使用源提交 SHA 作为 Codex cachebuster。

## 自动更新

先完成上面的 Git marketplace 安装，再克隆本仓库并运行对应平台的一次性安装器：

```bash
git clone https://github.com/StriveToLearnCode/ai-talk-marketplace.git
cd ai-talk-marketplace

# macOS，默认每 6 小时检查一次
./scripts/install-auto-update-macos.sh

# Linux systemd，默认每 6 小时检查一次
./scripts/install-auto-update-linux.sh
```

Windows PowerShell：

```powershell
git clone https://github.com/StriveToLearnCode/ai-talk-marketplace.git
Set-Location ai-talk-marketplace
.\scripts\install-auto-update-windows.ps1
```

定时任务依次执行 `marketplace upgrade` 和 `plugin add`。更新不会替换当前正在运行的任务，新版本从下一个 Codex 任务开始生效。各安装器都支持 `--uninstall`，Windows 使用 `-Uninstall`。

维护者也可以继续从本地 public marketplace 测试：

```bash
codex plugin marketplace add /绝对路径/ai-talk-public-marketplace
codex plugin add ai-talk@ai-talk-marketplace
```

高级选项：为某个仓库确保每条研发消息都触发 AI Talk：

```bash
node /绝对路径/ai-talk/scripts/install-strict-mode.mjs --project /绝对项目路径
```

```text
这两处标注的用户头像都加上 pag/user 溜光
```

Strict Mode 只提高触发覆盖率，不改变锁定、边界和对账体验。非研发对话不使用 AI Talk；`$ai-talk:...` 仅保留为兼容的显式调用方式。

完整说明见 [USAGE.md](USAGE.md)。`route-company-skills.mjs` 与 `TaskHandoff 1.1` 仅保留为 legacy CLI 兼容层。
