import json
import re
import unittest
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parents[1]
PLUGIN_DIR = SKILL_DIR.parents[1]


class SkillContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.skill_text = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
        cls.agent_text = (SKILL_DIR / "agents" / "openai.yaml").read_text(
            encoding="utf-8"
        )
        cls.capability_text = (
            SKILL_DIR / "references" / "capability-reuse.md"
        ).read_text(encoding="utf-8")
        cls.feature_text = (
            SKILL_DIR / "references" / "feature-development.md"
        ).read_text(encoding="utf-8")
        cls.manifest = json.loads(
            (PLUGIN_DIR / ".codex-plugin" / "plugin.json").read_text(
                encoding="utf-8"
            )
        )

    def test_frontmatter_declares_prompt_only_behavior(self):
        frontmatter = self.skill_text.split("---", 2)[1]
        for text in (
            "只输出提示词",
            "不读取业务文件或下游 Skill 正文",
            "不调用 Skill",
            "不访问 Figma、飞书、浏览器或网络",
        ):
            self.assertIn(text, frontmatter)

    def test_direct_route_is_tool_free(self):
        self.assertIn("### `direct`", self.skill_text)
        self.assertIn("项目命令数为 0", self.skill_text)
        self.assertIn("一次响应完成，目标 15 秒内", self.skill_text)
        self.assertIn("纯文案、语法、明确机械修改", self.skill_text)

    def test_discovery_allows_only_one_frontmatter_index(self):
        for text in (
            "只允许运行一次 Skill-only 索引",
            "--skills-only",
            "--intent <analyze|plan|modify_and_verify|review>",
            "--skill-limit 10",
            ".agents/skills/**/SKILL.md",
            "忽略正文和缺少 `name` 或 `description` 的 Skill",
            "项目命令、业务文件读取、reference 读取、额外 Skill 调用和浏览器调用均为 0",
        ):
            self.assertIn(text, self.skill_text)

    def test_downstream_skills_are_never_read_or_invoked(self):
        for text in (
            "不读取候选或已选择 Skill 的 `SKILL.md` 正文",
            "不调用任何下游 Skill",
            "不得读取候选正文来验证模式",
            "不得调用候选",
            "不运行 `collect_context.py`",
            "不读取目标文件、业务目录、项目规则、接口文档或附件链接内容",
        ):
            self.assertIn(text, self.skill_text)

    def test_external_tools_are_forbidden(self):
        for text in ("Chrome", "Figma", "飞书", "浏览器", "网络工具"):
            self.assertIn(text, self.skill_text)
        self.assertIn("不修改文件", self.skill_text)
        self.assertIn("不运行 formatter、lint、测试、构建", self.skill_text)

    def test_skill_names_are_fenced_prompt_text_only(self):
        self.assertIn(
            "只能作为 fenced `text` 代码块中的文本",
            self.skill_text,
        )
        self.assertIn(
            "Skill 名称即使带 `$` 也只是待复制的提示词文本",
            self.skill_text,
        )
        self.assertIn("$gen-code", self.skill_text)
        self.assertIn("$ai-test", self.skill_text)
        self.assertIn("仅写入提示词，尚未调用", self.skill_text)

    def test_feature_and_test_sequence_is_explicit(self):
        self.assertIn("功能开发与测试同时存在时，先写代码 Skill，再写测试 Skill", self.skill_text)
        self.assertIn("$gen-code` 使用 `local-patch + incremental`", self.skill_text)
        self.assertIn("`$ai-test` 在功能完成后", self.skill_text)
        self.assertLess(self.skill_text.index("$gen-code"), self.skill_text.index("$ai-test"))

    def test_generic_skills_are_not_added_implicitly(self):
        self.assertIn(
            "不因 Vue、Figma、文档等通用词追加通用指南、Figma 分析、文档维护或其他辅助 Skill",
            self.skill_text,
        )
        self.assertNotIn("先调用公司组件 Skill", self.skill_text)
        self.assertNotIn("--defer-project-component-choice", self.skill_text)

    def test_prompt_facts_are_limited_to_user_and_route_metadata(self):
        for category in ("`用户事实`", "`路由事实`", "`未确认信息`"):
            self.assertIn(category, self.skill_text)
        self.assertIn("不生成未经读取的项目事实", self.skill_text)
        self.assertIn("不把 Skill description 中支持的能力扩写成用户需求", self.skill_text)

    def test_handling_modes_are_preserved(self):
        for mode in ("analyze", "plan", "modify_and_verify", "review"):
            self.assertIn(f"`{mode}`", self.skill_text)
        self.assertIn("不得写成“先确认后给方案”", self.skill_text)

    def test_output_contract_stops_after_prompt(self):
        self.assertIn("随后输出一个 fenced `text` 代码块", self.skill_text)
        self.assertIn("任务话术已生成，当前尚未执行代码修改", self.skill_text)
        self.assertIn("不得继续读取、调用或执行", self.skill_text)
        self.assertIn("不得输出确认、取消、开始等伪交互文案", self.skill_text)

    def test_capability_reference_matches_pure_prompt_mode(self):
        for text in (
            "不是运行时必读材料",
            "只解析 `.agents/skills/**/SKILL.md` frontmatter",
            "Skill 正文、reference、脚本、组件、模板、历史实现和业务文件不进入 AI Talk 上下文",
            "AI Talk 不调用 Skill",
            "项目命令最多 1 次",
        ):
            self.assertIn(text, self.capability_text)

    def test_feature_prompt_delegates_real_discovery_downstream(self):
        self.assertIn("$<skill-name>", self.feature_text)
        self.assertIn("local-patch + incremental", self.feature_text)
        self.assertIn("读取组件注册表和真实组件文档", self.feature_text)

    def test_skill_is_explicit_only(self):
        self.assertRegex(
            self.agent_text,
            re.compile(r"policy:\s+allow_implicit_invocation: false", re.MULTILINE),
        )
        self.assertIn("$ai-talk", self.agent_text)

    def test_plugin_metadata_matches_prompt_only_positioning(self):
        description = self.manifest["interface"]["longDescription"]
        for text in (
            "只输出",
            "frontmatter",
            "不读取业务文件",
            "不调用下游 Skill",
            "15 秒",
        ):
            self.assertIn(text, description)


if __name__ == "__main__":
    unittest.main()
