# Skill 路由维护说明

本文件用于维护和测试 AI Talk 的路由契约，不是运行时必读材料。AI Talk 的运行规则已经完整写在 `SKILL.md` 中。

## 唯一发现方式

需要为后续 Codex 选择项目 Skill 时，只运行一次：

```bash
node <AI Talk Skill 目录>/scripts/build-capability-index.mjs \
  --root <项目根目录> \
  --skills-only \
  --intent <analyze|plan|modify_and_verify|review> \
  --skill-limit 10 \
  --query '<用户原始需求与明确边界>'
```

索引只解析 `.agents/skills/**/SKILL.md` frontmatter 的 `name` 和 `description`。Skill 正文、reference、脚本、组件、模板、历史实现和业务文件不进入 AI Talk 上下文。

## 结果使用

- `skill_candidates` 是提示词路由元数据，不代表 Skill 已调用。
- 只根据 frontmatter 语义选择后续执行 Skill，不读取候选正文验证能力。
- 功能和测试同时存在时，在最终 `text` 代码块中先安排代码 Skill，再安排测试 Skill。
- `$<skill-name>` 只作为代码块文本输出。AI Talk 不调用 Skill，也不执行其前置流程。
- 组件、接口、Figma、飞书和测试所需的真实上下文，全部交给后续 Codex 调用所选 Skill 时读取。

## 禁止降级

Skill-only 无结果或失败时，不得运行 `collect_context.py`、完整索引、公司组件 Skill、项目搜索、浏览器或网络工具。保留真实失败原因，并在提示词中要求后续 Codex 自行检查适用 Skill。

AI Talk 阶段的固定目标是：项目命令最多 1 次；业务文件读取、下游 Skill 调用、reference 读取、Figma、飞书、浏览器、代码修改和测试执行均为 0。
